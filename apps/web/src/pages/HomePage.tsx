// "/" : 画面0(未 onboarded)→ 画面1 ルーム作成(→ 画面1b 行き先の検索)。
// 作成が成功したら /r/:roomId へ遷移する。
import { useState } from "react";
import { useNavigate } from "react-router";
import { mutate as globalMutate } from "swr";
import { api } from "../api.js";
import { DestinationSearch, type SelectedDestination } from "../screens/DestinationSearch.js";
import { GettingStarted } from "../screens/GettingStarted.js";
import { RoomCreate } from "../screens/RoomCreate.js";
import { isOnboarded, saveSession, setOnboarded } from "../session.js";
import { useCatalog } from "../swr.js";

export function HomePage() {
  const navigate = useNavigate();
  const [onboarded, setOnboardedState] = useState(isOnboarded());
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState<SelectedDestination | null>(null);
  const [expiresAtIso, setExpiresAtIso] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const { data: catalog } = useCatalog();

  if (!onboarded) {
    return (
      <GettingStarted
        onStart={() => {
          setOnboarded();
          setOnboardedState(true);
        }}
      />
    );
  }

  if (picking) {
    return (
      <DestinationSearch
        destinations={catalog?.destinations ?? []}
        onBack={() => setPicking(false)}
        onSelect={(d) => {
          setDestination(d);
          setPicking(false);
        }}
      />
    );
  }

  async function handleSubmit() {
    if (!name.trim() || !destination) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const result = await api.createRoom({
        hostNameJa: name,
        destination: {
          catalogId: destination.catalogId,
          nameJa: destination.nameJa,
          lat: destination.lat,
          lng: destination.lng,
        },
        ...(expiresAtIso ? { expiresAt: expiresAtIso } : {}),
      });
      saveSession(result.room.id, {
        v: 1,
        participantId: result.participantId,
        token: result.hostToken,
        role: "host",
        expiresAt: result.room.expiresAt,
      });
      // 作成直後の room を SWR のキャッシュへ先に入れておく。
      // /r/:id へ移った瞬間の再取得待ちを消す。
      await globalMutate(["room", result.room.id], result.room, { revalidate: false });
      navigate(`/r/${result.room.id}`);
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RoomCreate
      Mode="Create"
      name={name}
      onNameChange={setName}
      destinationName={destination?.nameJa ?? null}
      onDestinationClick={() => setPicking(true)}
      expiresAtIso={expiresAtIso}
      onExpiresAtChange={setExpiresAtIso}
      onSubmit={handleSubmit}
      submitDisabled={submitting || !name.trim() || !destination}
      error={submitError}
      onRetry={handleSubmit}
    />
  );
}
