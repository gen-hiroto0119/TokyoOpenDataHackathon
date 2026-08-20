// 東京都「新宿駅周辺の施設情報及び移動ルート」の ZIP を、推薦 Worker が読む
// graph.json と catalog.json に変える。リクエストの経路には乗らない。
//
// 契約の正本は docs/RECOMMENDER.md。
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// ---------------------------------------------------------------- 入力

type navFile struct {
	Drawings []struct {
		Levels []struct {
			ID         int64 `json:"id"`
			Properties struct {
				Name   string `json:"name"`
				ZLevel int    `json:"zlevel"`
			} `json:"properties"`
		} `json:"levels"`
	} `json:"d"`
	Nodes []struct {
		ID    int64 `json:"id"`
		Links []struct {
			LID int64 `json:"lid"`
			GID int64 `json:"gid"`
		} `json:"l"`
		MX float64 `json:"mx"`
		MY float64 `json:"my"`
	} `json:"n"`
	Links []struct {
		ID int64   `json:"id"`
		N1 int64   `json:"n1"`
		N2 int64   `json:"n2"`
		D  int     `json:"d"`
		DM float64 `json:"dm"`
		DZ int     `json:"dz"`
	} `json:"l"`
}

type comMap struct {
	Drawings []struct {
		Levels []struct {
			ID         int64 `json:"id"`
			Properties struct {
				Name   string `json:"name"`
				ZLevel int    `json:"zlevel"`
			} `json:"properties"`
		} `json:"levels"`
	} `json:"drawings"`
}

type feature struct {
	ID         int64 `json:"id"`
	Properties struct {
		DisplayName string `json:"display_name"`
		Facility    string `json:"facility"`
		Barrier     string `json:"barrier"`
		Traffic     string `json:"traffic"`
		Marker      string `json:"marker"`
	} `json:"properties"`
	Location *struct {
		Coordinates []float64 `json:"coordinates"`
	} `json:"location"`
	Geometry struct {
		Type        string          `json:"type"`
		Coordinates json.RawMessage `json:"coordinates"`
	} `json:"geometry"`
}

type featureCollection struct {
	Features []feature `json:"features"`
}

// 日本語の名前はジオメトリではなくエンティティに付いている。
type comEntity struct {
	Entities []struct {
		Properties struct {
			Name     string `json:"name"`
			Geometry []any  `json:"geometry"`
		} `json:"properties"`
	} `json:"entities"`
}

// ---------------------------------------------------------------- 出力

type graphNode struct {
	ID         string   `json:"id"`
	LevelIDs   []string `json:"levelIds"`
	GeomIDs    []string `json:"geomIds"`
	NameJa     *string  `json:"nameJa"`
	FloorLabel *string  `json:"floorLabel"`
	X          float64  `json:"x"`
	Y          float64  `json:"y"`
}

type graphLink struct {
	ID        string  `json:"id"`
	From      string  `json:"from"`
	To        string  `json:"to"`
	DistanceM float64 `json:"distanceM"`
	DeltaZ    int     `json:"deltaZ"`
	Vertical  string  `json:"vertical"`
	Hours     *struct {
		Start string `json:"start"`
		End   string `json:"end"`
	} `json:"hours"`
}

type graphOut struct {
	DatasetID      string      `json:"datasetId"`
	DatasetVersion string      `json:"datasetVersion"`
	GraphHash      string      `json:"graphHash"`
	AttributionJa  string      `json:"attributionJa"`
	Nodes          []graphNode `json:"nodes"`
	Links          []graphLink `json:"links"`
}

type entryEntry struct {
	CatalogID string   `json:"catalogId"`
	LineIDs   []string `json:"lineIds"`
	NodeID    string   `json:"nodeId"`
	NameJa    string   `json:"nameJa"`
}

type meetingEntry struct {
	CatalogID      *string `json:"catalogId"`
	NodeID         string  `json:"nodeId"`
	NameJa         string  `json:"nameJa"`
	Explainability int     `json:"explainability"`
	Evidence       string  `json:"evidence"`
	// 集合場所から目的地への Maps リンクの origin に使う。
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type exitEntry struct {
	CatalogID string  `json:"catalogId"`
	NodeID    string  `json:"nodeId"`
	/* 東京都データ側のラベル。番号・記号・空のいずれか。現地がそうなっている。 */
	Label  string  `json:"label"`
	NameJa string  `json:"nameJa"`
	/* ラベルの出どころ。tokyo は東京都データ、manual は手書き。 */
	LabelSource string `json:"labelSource"`
	/* 人が見て確かめたか。hypothesis は取り込んだだけの状態。 */
	Evidence string `json:"evidence"`
	Lat    float64 `json:"lat"`
	Lng    float64 `json:"lng"`
}

type destinationEntry struct {
	CatalogID string  `json:"catalogId"`
	NameJa    string  `json:"nameJa"`
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
}

type catalogOut struct {
	Entries      []entryEntry       `json:"entries"`
	Meetings     []meetingEntry     `json:"meetings"`
	Exits        []exitEntry        `json:"exits"`
	Destinations []destinationEntry `json:"destinations"`
}


// ---------------------------------------------------------------- 出口の名前

type center struct {
	lat, lng float64
	ok       bool
}

// 出入口は面で入っている。その外周の重心を代表点にする。
func polygonCenter(f feature) center {
	if f.Geometry.Type != "Polygon" {
		return center{}
	}
	var poly [][][2]float64
	if err := json.Unmarshal(f.Geometry.Coordinates, &poly); err != nil || len(poly) == 0 || len(poly[0]) == 0 {
		return center{}
	}
	var lat, lng float64
	for _, c := range poly[0] {
		lng += c[0]
		lat += c[1]
	}
	n := float64(len(poly[0]))
	return center{lat / n, lng / n, true}
}

func haversineM(lat1, lng1, lat2, lng2 float64) float64 {
	const r = 6371000.0
	toRad := func(d float64) float64 { return d * math.Pi / 180 }
	dLat := toRad(lat2 - lat1)
	dLng := toRad(lng2 - lng1)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*math.Sin(dLng/2)*math.Sin(dLng/2)
	return 2 * r * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// 出口の表示名。看板に書いてあるとおりに出す。
//
// 番号は事業者ごとに振り直されていて、新宿駅に「7番出入口」は3つある。
// ただし曖昧なのは口頭で場所を指すときの話で、この経路案内では違う。
// 利用者はもう集合していて、こちらが出した経路をたどって一緒に歩く。
// 目の前の看板の「7」を見つければよく、どの事業者の7番かを知る必要がない。
// だから番号を直したり修飾したりせず、そのまま出す。
func exitNameOf(label string) string {
	if label == "" {
		return "地上出口"
	}
	// 番号・記号は看板の文字なので「出口」を前に付ける。
	// 手で書いた「ルミネエスト 地下入口」のような文はそのまま出す。
	if len([]rune(label)) <= 3 {
		return "出口 " + label
	}
	return label
}

func isNumeric(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------- 路線の対応

// 改札名から路線を決める。名前は英字表記が混ざるので両方見る。
// 取り込みのたびに目視で確認する前提の対応表。推測で足さない。
var linePatterns = []struct {
	lineID string
	re     *regexp.Regexp
}{
	{"line.jr", regexp.MustCompile(`(?i)\bJR|JR`)},
	{"line.keio", regexp.MustCompile(`(?i)Keio|京王`)},
	{"line.odakyu", regexp.MustCompile(`(?i)Odakyu|小田急`)},
	{"line.oedo", regexp.MustCompile(`(?i)Oedo|大江戸`)},
	{"line.marunouchi", regexp.MustCompile(`(?i)Marunouchi|丸ノ内`)},
	{"line.shinjuku", regexp.MustCompile(`(?i)ShinjukuLine|都営新宿`)},
	{"line.seibu", regexp.MustCompile(`(?i)Seibu|西武`)},
}

// 出場専用の改札は入口にしない。ここから入ってくる人はいない。
var exitOnly = regexp.MustCompile(`出口専用|出場専用|Exitonly|Exit only`)

func linesOf(name string) []string {
	var out []string
	for _, p := range linePatterns {
		if p.re.MatchString(name) {
			out = append(out, p.lineID)
		}
	}
	sort.Strings(out)
	return out
}

// ---------------------------------------------------------------- 補助

func readJSON(path string, into any) {
	b, err := os.ReadFile(path)
	if err != nil {
		log.Fatalf("read %s: %v", path, err)
	}
	if err := json.Unmarshal(b, into); err != nil {
		log.Fatalf("parse %s: %v", path, err)
	}
}

// 緯度経度を、駅の中心を原点にしたメートルの平面へ落とす。
// 手順の方向を出すためだけに使う。距離は都データの dm を使う。
func project(lat, lng, lat0, lng0 float64) (float64, float64) {
	const mPerDegLat = 111320.0
	x := (lng - lng0) * mPerDegLat * math.Cos(lat0*math.Pi/180)
	y := (lat - lat0) * mPerDegLat
	return x, y
}

func slug(s string) string {
	s = strings.TrimSpace(s)
	s = strings.NewReplacer("/", "-", " ", "", "(", "", ")", "", ".", "", "・", "-").Replace(s)
	if s == "" {
		return "unnamed"
	}
	return s
}

func main() {
	in := flag.String("in", "data/raw/extracted", "展開済みの東京都データ")
	out := flag.String("out", "data/graph", "出力先")
	labelPath := flag.String("labels", "data/labels/exits.json", "手で付けた出口のラベル")
	version := flag.String("version", "2023-02-20", "配布データの版")
	hash := flag.String("hash", "", "ZIP の SHA-256")
	flag.Parse()

	var nav navFile
	readJSON(filepath.Join(*in, "v5_nav.json"), &nav)
	var cm comMap
	readJSON(filepath.Join(*in, "com-map.geojson"), &cm)

	levelName := map[int64]string{}
	levelZ := map[int64]int{}
	for _, d := range cm.Drawings {
		for _, l := range d.Levels {
			levelName[l.ID] = l.Properties.Name
			levelZ[l.ID] = l.Properties.ZLevel
		}
	}

	geoms := map[int64]feature{}
	matches, _ := filepath.Glob(filepath.Join(*in, "geojson-level-geom-*.geojson"))
	for _, path := range matches {
		var fc featureCollection
		readJSON(path, &fc)
		for _, f := range fc.Features {
			geoms[f.ID] = f
		}
	}

	// ジオメトリ ID から日本語の名前を引く。無ければジオメトリ側の名前を使う。
	var ce comEntity
	readJSON(filepath.Join(*in, "com-entity.geojson"), &ce)
	gidNameJa := map[int64]string{}
	for _, ent := range ce.Entities {
		name := strings.TrimSpace(strings.ReplaceAll(ent.Properties.Name, "　", " "))
		if name == "" {
			continue
		}
		for _, g := range ent.Properties.Geometry {
			pair, ok := g.([]any)
			if !ok || len(pair) == 0 {
				continue
			}
			id, ok := pair[0].(float64)
			if !ok {
				continue
			}
			if _, exists := gidNameJa[int64(id)]; !exists {
				gidNameJa[int64(id)] = name
			}
		}
	}
	displayName := func(gid int64) string {
		if n, ok := gidNameJa[gid]; ok {
			return n
		}
		return geoms[gid].Properties.DisplayName
	}

	// 平面の原点。駅の中心あたりを取る。
	var sumLat, sumLng float64
	var n int
	for _, f := range geoms {
		if f.Location != nil && len(f.Location.Coordinates) == 2 {
			sumLng += f.Location.Coordinates[0]
			sumLat += f.Location.Coordinates[1]
			n++
		}
	}
	lat0, lng0 := sumLat/float64(n), sumLng/float64(n)

	nodeLatLng := map[int64][2]float64{}
	nodes := make([]graphNode, 0, len(nav.Nodes))
	for _, nd := range nav.Nodes {
		var levels, gids []string
		var nameJa *string
		var floor *string
		var lat, lng float64
		var hasLoc bool
		for _, l := range nd.Links {
			if name, ok := levelName[l.LID]; ok {
				levels = append(levels, name)
				if floor == nil {
					f := name
					floor = &f
				}
			}
			if l.GID != 0 {
				gids = append(gids, strconv.FormatInt(l.GID, 10))
				g, ok := geoms[l.GID]
				if ok {
					if !hasLoc && g.Location != nil && len(g.Location.Coordinates) == 2 {
						lng, lat = g.Location.Coordinates[0], g.Location.Coordinates[1]
						hasLoc = true
					}
					// 名前は「場所」に付いているものだけ取る。通路や壁の名前は出さない。
					if name := displayName(l.GID); nameJa == nil && name != "" &&
						(g.Properties.Facility == "unit" || g.Properties.Barrier == "gate") {
						n := name
						nameJa = &n
					}
				}
			}
		}
		id := strconv.FormatInt(nd.ID, 10)
		var x, y float64
		if hasLoc {
			x, y = project(lat, lng, lat0, lng0)
			nodeLatLng[nd.ID] = [2]float64{lat, lng}
		}
		nodes = append(nodes, graphNode{
			ID: id, LevelIDs: levels, GeomIDs: gids,
			NameJa: nameJa, FloorLabel: floor, X: x, Y: y,
		})
	}

	// 縦移動の手段。リンクに種別が無いので、両端のジオメトリから引く。
	facilityOf := func(nodeID int64) string {
		for _, nd := range nav.Nodes {
			if nd.ID != nodeID {
				continue
			}
			for _, l := range nd.Links {
				if g, ok := geoms[l.GID]; ok {
					switch g.Properties.Facility {
					case "stairs", "escalator", "elevator":
						return g.Properties.Facility
					}
				}
			}
		}
		return ""
	}
	facCache := map[int64]string{}
	facility := func(id int64) string {
		if v, ok := facCache[id]; ok {
			return v
		}
		v := facilityOf(id)
		facCache[id] = v
		return v
	}

	links := make([]graphLink, 0, len(nav.Links)*2)
	for _, l := range nav.Links {
		vertical := "none"
		if l.DZ != 0 {
			vertical = "unknown"
			if v := facility(l.N1); v != "" {
				vertical = v
			} else if v := facility(l.N2); v != "" {
				vertical = v
			}
		}
		a := strconv.FormatInt(l.N1, 10)
		b := strconv.FormatInt(l.N2, 10)
		id := strconv.FormatInt(l.ID, 10)
		// d は 1=順方向 2=逆方向 3=双方向。ここで向きを解く。
		if l.D == 1 || l.D == 3 {
			links = append(links, graphLink{ID: id + ".f", From: a, To: b, DistanceM: l.DM, DeltaZ: l.DZ, Vertical: vertical})
		}
		if l.D == 2 || l.D == 3 {
			links = append(links, graphLink{ID: id + ".r", From: b, To: a, DistanceM: l.DM, DeltaZ: -l.DZ, Vertical: vertical})
		}
	}

	// 改札。名前のある barrier:gate のジオメトリに付いたノードを全部拾う。手で選ばない。
	gidNodes := map[int64][]int64{}
	for _, nd := range nav.Nodes {
		for _, l := range nd.Links {
			if l.GID != 0 {
				gidNodes[l.GID] = append(gidNodes[l.GID], nd.ID)
			}
		}
	}
	// map の反復順は実行ごとに変わる。同じノードへ複数の地物が寄るとき、
	// どれが残るかが揺れて出力が再現しなくなる。ID の順に固定する。
	gidsSorted := make([]int64, 0, len(geoms))
	for gid := range geoms {
		gidsSorted = append(gidsSorted, gid)
	}
	sort.Slice(gidsSorted, func(i, j int) bool { return gidsSorted[i] < gidsSorted[j] })

	var entries []entryEntry
	seenEntry := map[string]bool{}
	var gatesWithoutLine []string
	var skippedExitOnly []string
	for _, gid := range gidsSorted {
		f := geoms[gid]
		name := displayName(gid)
		if f.Properties.Barrier != "gate" || name == "" {
			continue
		}
		if exitOnly.MatchString(name) || exitOnly.MatchString(f.Properties.DisplayName) {
			skippedExitOnly = append(skippedExitOnly, name)
			continue
		}
		// 路線の判定は日本語名と英字名の両方で試す。
		lines := linesOf(name)
		if len(lines) == 0 {
			lines = linesOf(f.Properties.DisplayName)
		}
		if len(lines) == 0 {
			gatesWithoutLine = append(gatesWithoutLine, name)
			continue
		}
		ids := gidNodes[gid]
		sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
		for _, nodeID := range ids {
			catalogID := "entry." + strconv.FormatInt(gid, 10) + "." + strconv.FormatInt(nodeID, 10)
			if seenEntry[catalogID] {
				continue
			}
			seenEntry[catalogID] = true
			entries = append(entries, entryEntry{
				CatalogID: catalogID, LineIDs: lines,
				NodeID: strconv.FormatInt(nodeID, 10), NameJa: name,
			})
		}
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].CatalogID < entries[j].CatalogID })

	// 集合候補。名前のあるノードを広く拾う。店舗も入れる。
	// 「スタバの前で」は実際によく使う待ち合わせ方で、看板があるぶん初見でも見つけやすい。
	// 交番や広場だけに絞ると候補が薄くなり、全員の負担が偏らない地点を選べなくなる。
	//
	// ただし仕様書は「調査当時の情報であり、店舗や出入口は現状と違うことがある」と書いている。
	// 潰れた店を指定すると現地で見つからない。だから
	//   - 全部 evidence: hypothesis とし、現地で確認したものだけ上げる
	//   - 説明しやすさで階層を付け、同点なら交番・広場・案内所が店舗に勝つようにする
	// 学習ではなく、ここで決めた順位。
	// 名前として使えないものを外す。
	// 番線番号（"11"）、区画コード（"D10"、"A1"）、内部 ID（"Unit B3F-115"）は
	// 現地の案内表示と照らし合わせられないので、集合場所にできない。
	codeName := regexp.MustCompile(`^[0-9]+$|^[A-Za-z]$|^[0-9A-Za-z][0-9A-Za-z\-\. ]{0,3}$|^(?i:Unit\s?[0-9A-Za-z]*-?[0-9]+)$`)
	// 立って待つ場所ではないもの。
	privateName := regexp.MustCompile(`おむつ|オムツ|授乳|multipurpose|Nursing`)
	// 設備の一般名。駅に同じものが何個もあるので、言われても特定できない。
	genericName := regexp.MustCompile(`(?i)^ATM|券売機|精算機|コインロッカー|ロッカー|休憩所|待合室|トイレ|化粧室|お手洗|エレベーター|エスカレーター|階段|喫煙|自動販売機|給湯|AED|Vending|Locker|Restroom|Toilet|Elevator|Escalator|Stairs`)

	explainOf := func(name string) int {
		switch {
		case strings.Contains(name, "交番"):
			return 5
		case strings.Contains(name, "案内所") || strings.Contains(name, "インフォメーション"):
			return 4
		case strings.Contains(name, "広場") || strings.Contains(name, "コンコース"):
			return 3
		case strings.Contains(name, "改札"):
			return 2
		default: // 店舗など。入れ替わりうるので一番下。
			return 1
		}
	}
	// 同じ名前が駅に何個もある地点は候補にしない。
	// 「◯◯の前で」と言われても、どれのことか分からない。
	// PRODUCT.md の評価 5 が求めている「固有性」はここで効かせる。
	nameCount := map[string]int{}
	for gid := range geoms {
		if n := displayName(gid); n != "" {
			nameCount[n]++
		}
	}

	var meetings []meetingEntry
	seenMeeting := map[string]bool{}
	var droppedDuplicate int
	for _, gid := range gidsSorted {
		f := geoms[gid]
		name := displayName(gid)
		if name == "" || codeName.MatchString(name) || privateName.MatchString(name) {
			continue
		}
		if genericName.MatchString(name) {
			continue
		}
		if nameCount[name] > 1 {
			droppedDuplicate++
			continue
		}
		// 出場専用の改札は集合場所にしない。そこへ向かう人が入れない。
		if exitOnly.MatchString(name) || exitOnly.MatchString(f.Properties.DisplayName) {
			continue
		}
		// 通路・壁・線路などは候補にしない。立って待てる場所だけ。
		switch f.Properties.Facility {
		case "unit", "hallway", "":
		default:
			continue
		}
		if f.Properties.Traffic != "" {
			continue
		}
		ids := gidNodes[gid]
		sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
		if len(ids) == 0 {
			continue
		}
		nodeID := strconv.FormatInt(ids[0], 10)
		if seenMeeting[nodeID] {
			continue
		}
		ll, ok := nodeLatLng[ids[0]]
		if !ok {
			continue
		}
		seenMeeting[nodeID] = true
		cid := "meet." + strconv.FormatInt(gid, 10)
		meetings = append(meetings, meetingEntry{
			CatalogID: &cid, NodeID: nodeID, NameJa: name,
			Explainability: explainOf(name), Evidence: "hypothesis",
			Lat: ll[0], Lng: ll[1],
		})
	}
	sort.Slice(meetings, func(i, j int) bool { return meetings[i].NodeID < meetings[j].NodeID })

	// 出口。marker=entrance の地物が 96 件ある。地上に出る所なので全部 1F。
	// ラベルは番号・記号・空のいずれかで、事業者ごとに振り直されているため
	// 「7番出入口」だけでは新宿駅に3つあって指せない。Apple のマップでも同じ状態で、
	// これはデータの誤りではなく現地がそうなっている。
	// ただし曖昧なのは口頭で場所を指すときの話で、この案内では違う。
	// 経路を出して一緒に歩かせる以上、文脈はこちらが供給している。
	// だから番号を直さず、修飾もせず、看板のとおりに出す。
	//
	// 24 件は経路データがその地物を参照していない。ただし外にあるわけではなく、
	// 全部 2〜12m 以内に 1F のノードがある。結びつけが抜けているだけなので、
	// 同じ階の一番近いノードに寄せる。離れているものは寄せない。
	const snapM = 15.0
	type nodePos struct {
		id  int64
		lat float64
		lng float64
	}
	var groundNodes []nodePos
	for _, nd := range nodes {
		if nd.FloorLabel == nil || *nd.FloorLabel != "1F" {
			continue
		}
		id, err := strconv.ParseInt(nd.ID, 10, 64)
		if err != nil {
			continue
		}
		if ll, ok := nodeLatLng[id]; ok {
			groundNodes = append(groundNodes, nodePos{id, ll[0], ll[1]})
		}
	}
	snapTo := func(lat, lng float64) (int64, float64, bool) {
		bestID, bestD := int64(0), math.MaxFloat64
		for _, n := range groundNodes {
			d := haversineM(lat, lng, n.lat, n.lng)
			if d < bestD || (d == bestD && n.id < bestID) {
				bestID, bestD = n.id, d
			}
		}
		if bestID == 0 || bestD > snapM {
			return 0, 0, false
		}
		return bestID, bestD, true
	}

	// 東京都のデータには名前の無い出入口が 42 件ある。取り込みの漏れではなく
	// 元データに入っていない（display_name も entities の参照も無い）。
	// 付いている番号も現地と食い違うものがある。
	// どちらも手で付けたぶんをここで重ねる。出どころは分けて持つ。
	manualLabels := map[string]struct {
		LabelJa string `json:"labelJa"`
		/* 出口ではないと人が判断したもの。地下広場への入口や設備の開口が混ざる。 */
		Exclude bool `json:"exclude"`
		/* 人が見て出口だと確かめたもの。ラベルを直していなくても記録に残す。 */
		Confirmed bool `json:"confirmed"`
	}{}
	if b, err := os.ReadFile(*labelPath); err == nil {
		if err := json.Unmarshal(b, &manualLabels); err != nil {
			log.Fatalf("parse %s: %v", *labelPath, err)
		}
	}

	var exits []exitEntry
	var snapped, tooFar, manual, replaced, excluded, checked int
	seenExit := map[string]bool{}
	for _, gid := range gidsSorted {
		f := geoms[gid]
		if f.Properties.Marker != "entrance" {
			continue
		}
		ring := polygonCenter(f)
		if !ring.ok {
			continue
		}
		// 地物に紐づくノードのうち、出入口の中心に一番近いものを使う。
		// ID の若い順に取ると最大 13m ずれる。同じ距離なら ID の順。
		ids := gidNodes[gid]
		var nodeInt int64
		bestD := math.MaxFloat64
		for _, id := range ids {
			ll, ok := nodeLatLng[id]
			if !ok {
				continue
			}
			d := haversineM(ring.lat, ring.lng, ll[0], ll[1])
			if d < bestD || (d == bestD && id < nodeInt) {
				nodeInt, bestD = id, d
			}
		}
		if nodeInt == 0 {
			id, _, ok := snapTo(ring.lat, ring.lng)
			if !ok {
				tooFar++
				continue
			}
			nodeInt = id
			snapped++
		}
		nodeID := strconv.FormatInt(nodeInt, 10)
		// 同じノードに複数の出入口が寄ることがある。看板の文字があるものを残す。
		// 捨てると、現地に表示があるのに無名として出てしまう。
		if prev, taken := seenExit[nodeID]; taken {
			if prev || strings.TrimSpace(f.Properties.DisplayName) == "" {
				continue
			}
			for i := range exits {
				if exits[i].NodeID == nodeID {
					exits = append(exits[:i], exits[i+1:]...)
					break
				}
			}
		}
		ll, ok := nodeLatLng[nodeInt]
		if !ok {
			continue
		}
		// 出口の座標は地物そのものの中心を使う。ノードは経路上の点でしかない。
		if ring.ok {
			ll = [2]float64{ring.lat, ring.lng}
		}
		label := strings.TrimSpace(f.Properties.DisplayName)
		source := "tokyo"
		evidence := "hypothesis"
		// 手書きは東京都のラベルも上書きできる。現地と食い違っているものがある。
		if m, ok := manualLabels[strconv.FormatInt(gid, 10)]; ok {
			if m.Exclude {
				excluded++
				continue
			}
			if v := strings.TrimSpace(m.LabelJa); v != "" && v != label {
				label = v
				source = "manual"
				manual++
			}
			// ラベルを直していなくても、見て確かめたことは残す。
			if m.Confirmed || m.LabelJa != "" {
				evidence = "checked"
				checked++
			}
		}
		if label == "" {
			source = ""
		}
		if seenExit[nodeID] {
			replaced++
		}
		seenExit[nodeID] = label != ""
		exits = append(exits, exitEntry{
			CatalogID: "exit." + strconv.FormatInt(gid, 10), NodeID: nodeID,
			Label: label, NameJa: exitNameOf(label), LabelSource: source, Evidence: evidence,
			Lat: ll[0], Lng: ll[1],
		})
	}
	sort.Slice(exits, func(i, j int) bool { return exits[i].NodeID < exits[j].NodeID })

	destinations := []destinationEntry{
		{CatalogID: "dest.tokyo-metropolitan-government", NameJa: "東京都庁", Lat: 35.689487, Lng: 139.691711},
		{CatalogID: "dest.busta-shinjuku", NameJa: "バスタ新宿", Lat: 35.686622, Lng: 139.700258},
		{CatalogID: "dest.kabukicho", NameJa: "歌舞伎町", Lat: 35.694945, Lng: 139.702734},
		{CatalogID: "dest.shinjuku-central-park", NameJa: "新宿中央公園", Lat: 35.690833, Lng: 139.690278},
	}

	g := graphOut{
		DatasetID:      "tokyo.shinjuku-terminal",
		DatasetVersion: *version,
		GraphHash:      *hash,
		AttributionJa:  "東京都都市整備局「新宿駅周辺の施設情報及び移動ルート」（CC BY 4.0）",
		Nodes:          nodes,
		Links:          links,
	}
	c := catalogOut{Entries: entries, Meetings: meetings, Exits: exits, Destinations: destinations}

	if err := os.MkdirAll(*out, 0o755); err != nil {
		log.Fatal(err)
	}
	write := func(name string, v any) {
		b, err := json.Marshal(v)
		if err != nil {
			log.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(*out, name), b, 0o644); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("%-14s %8.1f KB\n", name, float64(len(b))/1024)
	}
	write("graph.json", g)
	write("catalog.json", c)

	fmt.Printf("\nnodes=%d links=%d(expanded)\n", len(nodes), len(links))
	fmt.Printf("entries=%d meetings=%d exits=%d（近さで結んだもの %d、遠すぎて外したもの %d、手書きラベル %d、外したもの %d、人が確かめたもの %d）\n",
		len(entries), len(meetings), len(exits), snapped, tooFar, manual, excluded, checked)
	fmt.Printf("同じ名前が複数あって候補から外した地点: %d\n", droppedDuplicate)
	byLine := map[string]int{}
	for _, e := range entries {
		for _, l := range e.LineIDs {
			byLine[l]++
		}
	}
	keys := make([]string, 0, len(byLine))
	for k := range byLine {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		fmt.Printf("  %-20s %d\n", k, byLine[k])
	}
	if len(skippedExitOnly) > 0 {
		sort.Strings(skippedExitOnly)
		fmt.Printf("\n出場専用として入口から外した改札 %d 件\n", len(skippedExitOnly))
		for _, n := range skippedExitOnly {
			fmt.Printf("  %s\n", n)
		}
	}
	if len(gatesWithoutLine) > 0 {
		sort.Strings(gatesWithoutLine)
		fmt.Printf("\n路線を判定できなかった改札 %d 件（対応表に足すか、外すかを決める）\n", len(gatesWithoutLine))
		for _, n := range gatesWithoutLine {
			fmt.Printf("  %s\n", n)
		}
	}
}
