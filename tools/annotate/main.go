// 出口の名前を OpenStreetMap の逆ジオコーディングで引き、注釈ファイルに残す。
//
// 東京都のデータには出口の名前が無く、番号だけの地物がある。番号だけでは
// 「7番出入口」としか出せず、どの路線の 7 番か分からない。
//
// 一度だけ引いて結果をリポジトリに置く。実行のたびに外へ問い合わせない。
// 使用条件（1 秒に 1 件まで、UA を名乗る、結果はキャッシュする）を守る。
// 出典表示が要る: © OpenStreetMap contributors（ODbL）
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

type exitEntry struct {
	CatalogID string  `json:"catalogId"`
	NodeID    string  `json:"nodeId"`
	NameJa    string  `json:"nameJa"`
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
}

type catalog struct {
	Exits []exitEntry `json:"exits"`
}

type reverseResult struct {
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	Address     struct {
		Neighbourhood string `json:"neighbourhood"`
		Quarter       string `json:"quarter"`
		Suburb        string `json:"suburb"`
		CityDistrict  string `json:"city_district"`
	} `json:"address"`
}

type annotation struct {
	NameJa   string `json:"nameJa"`
	AreaJa   string `json:"areaJa"`
	Raw      string `json:"raw"`
	Source   string `json:"source"`
	LookedUp string `json:"lookedUp"`
}

// 出口の名前に見えるものだけ採る。「Travelex」「新宿サブナード 2」は店名で、
// 現地の案内表示と照らし合わせられない。
var exitLike = regexp.MustCompile(`出入口|出口|広場|口$`)

func exitNameOf(raw string) string {
	name := strings.TrimSpace(raw)
	if name == "" || !exitLike.MatchString(name) {
		return ""
	}
	// 「京王 新宿駅;7番出入口」のような区切りを読める形にする。
	name = strings.ReplaceAll(name, ";", " ")
	name = strings.Join(strings.Fields(name), " ")
	return name
}

func main() {
	in := flag.String("catalog", "data/graph/catalog.json", "取り込み済みのカタログ")
	out := flag.String("out", "data/annotations/exits.json", "注釈の出力先")
	agent := flag.String("agent", "", "問い合わせ元。連絡先を含める（必須）")
	dry := flag.Bool("dry", false, "引かずに、いま何件足りないかだけ出す")
	flag.Parse()

	b, err := os.ReadFile(*in)
	if err != nil {
		log.Fatalf("read %s: %v", *in, err)
	}
	var c catalog
	if err := json.Unmarshal(b, &c); err != nil {
		log.Fatal(err)
	}

	existing := map[string]annotation{}
	if b, err := os.ReadFile(*out); err == nil {
		if err := json.Unmarshal(b, &existing); err != nil {
			log.Fatal(err)
		}
	}

	var todo []exitEntry
	for _, e := range c.Exits {
		if _, ok := existing[e.NodeID]; !ok {
			todo = append(todo, e)
		}
	}
	sort.Slice(todo, func(i, j int) bool { return todo[i].NodeID < todo[j].NodeID })
	fmt.Printf("出口 %d 件、注釈済み %d 件、これから引く %d 件\n", len(c.Exits), len(existing), len(todo))
	if *dry || len(todo) == 0 {
		return
	}
	if *agent == "" {
		log.Fatal("-agent に連絡先を含めた名前を指定してください（Nominatim の使用条件）")
	}

	client := &http.Client{Timeout: 20 * time.Second}
	today := time.Now().Format("2006-01-02")
	for i, e := range todo {
		q := url.Values{}
		q.Set("format", "jsonv2")
		q.Set("lat", fmt.Sprintf("%.7f", e.Lat))
		q.Set("lon", fmt.Sprintf("%.7f", e.Lng))
		q.Set("zoom", "18")
		q.Set("addressdetails", "1")
		q.Set("accept-language", "ja")
		req, _ := http.NewRequest("GET", "https://nominatim.openstreetmap.org/reverse?"+q.Encode(), nil)
		req.Header.Set("User-Agent", *agent)

		res, err := client.Do(req)
		if err != nil {
			log.Printf("  %s: %v", e.NodeID, err)
			continue
		}
		var rr reverseResult
		err = json.NewDecoder(res.Body).Decode(&rr)
		res.Body.Close()
		if err != nil {
			log.Printf("  %s: %v", e.NodeID, err)
			continue
		}

		area := rr.Address.Neighbourhood
		if area == "" {
			area = rr.Address.Quarter
		}
		if area == "" {
			area = rr.Address.Suburb
		}
		// 逆ジオコーディングは一番近い地物を返すので、店名が返ることがある。
		// 出口の名前に見えるものだけ採り、それ以外は空にして番号のまま出す。
		name := exitNameOf(rr.Name)
		existing[e.NodeID] = annotation{
			NameJa: name, AreaJa: area, Raw: rr.Name,
			Source: "OpenStreetMap (Nominatim)", LookedUp: today,
		}
		shown := name
		if shown == "" {
			shown = "（採らない: " + rr.Name + "）"
		}
		fmt.Printf("  %-10s %-14s -> %s / %s\n", e.NodeID, e.NameJa, shown, area)

		if i < len(todo)-1 {
			time.Sleep(1200 * time.Millisecond) // 1 秒に 1 件まで
		}
	}

	if err := os.MkdirAll(filepath.Dir(*out), 0o755); err != nil {
		log.Fatal(err)
	}
	b, err = json.MarshalIndent(existing, "", "  ")
	if err != nil {
		log.Fatal(err)
	}
	if err := os.WriteFile(*out, append(b, '\n'), 0o644); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("\n%s に %d 件\n", *out, len(existing))
}
