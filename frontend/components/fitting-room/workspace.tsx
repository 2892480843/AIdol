"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import {
  Camera,
  Shirt,
  Sparkles,
  Mic,
  X,
  ArrowLeft,
  Loader2,
  ScanLine,
  Upload,
  ChevronLeft,
  ChevronRight,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@mantine/core";
import { useLooksOwnerScope } from "@/lib/looks/use-owner-scope";
import { useWardrobe3D } from "@/lib/hooks/use-wardrobe-3d";
import { useWardrobeDraftItems } from "@/lib/hooks/use-wardrobe-draft";
import { useTryOn } from "@/lib/hooks/use-tryon";
import {
  useFittingCamera,
  useFittingVoice,
} from "@/lib/hooks/use-fitting-media";
import { useTypeLabel } from "@/lib/hooks/use-translated-constants";
import { validateLookPhoto } from "@/lib/looks/photo";
import {
  FITTING_GROUPS,
  fittingGroupForType,
  toggleFittingItemPreservingUnknown,
  resolveFittingCommand,
  type FittingGroup,
} from "@/lib/fitting-room";
import { isInspirationItemEligible } from "@/lib/inspiration/matching";
import { fittingRoomHref } from "@/lib/fitting-seed";
import type { Item } from "@/lib/types";
import { RackItemPhoto } from "@/components/wardrobe-3d/item-photo";
import { FittingMirror } from "./mirror";
import styles from "./workspace.module.css";

const STATUS_KEYS = {
  submitting: "starting",
  queued: "queued",
  processing: "running",
  succeeded: "succeeded",
  failed: "failed",
} as const;
export function FittingRoomWorkspace({ initialIds }: { initialIds: string[] }) {
  const { ownerId, epoch } = useLooksOwnerScope();
  const t = useTranslations("wardrobe.fitting");
  return ownerId ? (
    <SessionFittingRoom
      key={`${ownerId}:${epoch}`}
      owner={ownerId}
      initialIds={initialIds}
    />
  ) : (
    <p role="status">{t("loadingWardrobe")}</p>
  );
}
function SessionFittingRoom({
  owner,
  initialIds,
}: {
  owner: string;
  initialIds: string[];
}) {
  const t = useTranslations("wardrobe.fitting");
  const tr = useTranslations("wardrobe.rack");
  const ts = useTranslations("dashboard.looks.tryon");
  const locale = useLocale();
  const typeLabel = useTypeLabel();
  const wardrobe = useWardrobe3D();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const data = useTryOn(activeTaskId);
  const seeds = useWardrobeDraftItems(owner, initialIds);
  const camera = useFittingCamera();
  const [command, setCommand] = useState("");
  const receiveCommand = useRef<(value: string) => void>(() => {});
  const voice = useFittingVoice(
    (value) => receiveCommand.current(value),
    locale,
  );
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [commandNotice, setCommandNotice] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Item[]>([]);
  const [candidateAction, setCandidateAction] = useState<"wear" | "remove">(
    "wear",
  );
  const [ids, setIds] = useState(initialIds);
  const [focus, setFocus] = useState<FittingGroup | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const selectionHistory = useRef<
    { ids: string[]; focus: FittingGroup | null }[]
  >([]);
  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState<File | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [photoPending, setPhotoPending] = useState(false);
  const [consent, setConsent] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [captureError, setCaptureError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const serial = useRef(0);
  const alive = useRef(true);
  const submitting = useRef(false);
  const pairs = useRef(new Map<string, File>());
  useEffect(() => {
    alive.current = true;
    const sourcePairs = pairs.current;
    return () => {
      alive.current = false;
      serial.current += 1;
      sourcePairs.clear();
    };
  }, []);
  useEffect(() => {
    if (!person) {
      setPhoto(null);
      return;
    }
    const url = URL.createObjectURL(person);
    setPhoto(url);
    return () => URL.revokeObjectURL(url);
  }, [person]);
  const available = useMemo(() => {
    const map = new Map<string, Item>();
    for (const item of [
      ...wardrobe.items,
      ...seeds.entries.flatMap((entry) =>
        entry.state === "ready" && entry.item ? [entry.item] : [],
      ),
    ]) {
      if (
        item.user_id === owner &&
        isInspirationItemEligible(item) &&
        fittingGroupForType(item.type) &&
        (!data.capabilities ||
          data.capabilities.supported_item_types.includes(item.type))
      )
        map.set(item.id, item);
    }
    return Array.from(map.values());
  }, [wardrobe.items, seeds.entries, owner, data.capabilities]);
  const name = (item: Item) => item.name || typeLabel(item.type);
  const selected = ids.flatMap(
    (id) => available.find((item) => item.id === id) || [],
  );
  const unresolved = selected.length !== ids.length;
  const activeTask =
    activeTaskId === null
      ? data.tasks.find((task) => task.status === "succeeded") || data.tasks[0]
      : data.tasks.find((task) => task.id === activeTaskId);
  const photographicLooks = data.tasks.filter(
    (task) => task.status === "succeeded" && !!task.resultImageUrl,
  );
  const lookIndex = photographicLooks.findIndex(
    (task) => task.id === activeTask?.id,
  );
  const resultGarments = (
    activeTask?.item_ids ?? (activeTask ? [activeTask.item_id] : [])
  ).flatMap((id) => available.find((item) => item.id === id) || []);
  const canCompare =
    !!activeTask && !!person && pairs.current.get(activeTask.id) === person;
  const changed =
    !!activeTask &&
    [...(activeTask.item_ids ?? [activeTask.item_id])].sort().join(",") !==
      [...ids].sort().join(",");
  const filtered = available.filter(
    (item) =>
      (group === "all" || fittingGroupForType(item.type) === group) &&
      [
        name(item),
        item.brand,
        ...(item.colors ?? []),
        ...(item.tags?.style ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const blocked =
    data.isCreating ||
    !!camera.stream ||
    camera.pending ||
    photoPending ||
    !data.capabilities?.available ||
    !person ||
    !consent ||
    unresolved ||
    !fittingRoomHref(selected);
  const choosePhoto = async (file: File | null) => {
    if (data.isCreating || submitting.current) return;
    camera.stop();
    const ticket = ++serial.current;
    setConsent(false);
    pairs.current.clear();
    setPhotoError(false);
    setPerson(null);
    setActiveTaskId("draft");
    if (!file) {
      setPhotoPending(false);
      return;
    }
    setPhotoPending(true);
    try {
      await validateLookPhoto(file);
      if (alive.current && ticket === serial.current) setPerson(file);
    } catch {
      if (alive.current && ticket === serial.current) setPhotoError(true);
    } finally {
      if (alive.current && ticket === serial.current) setPhotoPending(false);
    }
  };
  const capture = async (video: HTMLVideoElement) => {
    setCaptureError(false);
    try {
      await choosePhoto(await camera.capture(video));
    } catch {
      if (alive.current) setCaptureError(true);
    }
  };
  const changeSelection = (
    next: string[],
    nextFocus: FittingGroup | null = focus,
  ) => {
    if (
      data.isCreating ||
      submitting.current ||
      next.join(",") === ids.join(",")
    )
      return;
    selectionHistory.current = [
      ...selectionHistory.current.slice(-19),
      { ids: [...ids], focus },
    ];
    setUndoCount(selectionHistory.current.length);
    setIds(next);
    setFocus(nextFocus);
    setCandidates([]);
    setCommandNotice(null);
  };
  const undoSelection = () => {
    if (data.isCreating || submitting.current) return;
    const previous = selectionHistory.current.pop();
    if (previous) {
      setIds(previous.ids);
      setFocus(previous.focus);
      setUndoCount(selectionHistory.current.length);
      setCandidates([]);
      setCommandNotice("commandUndone");
    }
  };
  const toggle = (item: Item) => {
    if (data.isCreating) return;
    changeSelection(
      toggleFittingItemPreservingUnknown(ids, item, available),
      fittingGroupForType(item.type),
    );
    setCandidates([]);
    setCommandNotice(null);
  };
  const applyCandidate = (item: Item, action: "wear" | "remove") => {
    const next =
      action === "remove"
        ? ids.filter((id) => id !== item.id)
        : ids.includes(item.id)
          ? ids
        : toggleFittingItemPreservingUnknown(ids, item, available);
    if (action === "wear" && !next.includes(item.id)) {
      setCandidates([]);
      setCommandNotice("commandCapacity");
      return;
    }
    changeSelection(next, fittingGroupForType(item.type));
    setFocus(fittingGroupForType(item.type));
    setCandidates([]);
    setCommandNotice(action === "remove" ? "commandRemoved" : "commandApplied");
  };
  const applyCommand = (text = command) => {
    if (data.isCreating || submitting.current) return;
    const result = resolveFittingCommand(text, available, name, ids, focus);
    if (result.action === "undo") {
      undoSelection();
      return;
    }
    if (result.action === "clear") {
      changeSelection([], null);
      setCandidates([]);
      setCommandNotice("commandCleared");
      return;
    }
    if (!result.items.length) {
      setCandidates([]);
      setCommandNotice("commandNoMatch");
      return;
    }
    if (result.ambiguous) {
      setCandidates(result.items);
      setCandidateAction(result.action === "remove" ? "remove" : "wear");
      setCommandNotice("commandAmbiguous");
      return;
    }
    applyCandidate(
      result.items[0],
      result.action === "remove" ? "remove" : "wear",
    );
  };
  receiveCommand.current = (value) => {
    if (!alive.current || data.isCreating || submitting.current) return;
    setCommand(value);
    if (voiceConsent) applyCommand(value);
  };
  const generate = async () => {
    if (blocked || submitting.current || !person) return;
    const original = person;
    submitting.current = true;
    setSubmitError(false);
    camera.stop();
    voice.stop();
    try {
      const task = await data.create({
        personPhoto: original,
        itemIds: [...ids],
        consent: true,
      });
      if (alive.current) {
        pairs.current.set(task.id, original);
        setActiveTaskId(task.id);
        if (task.status === "failed") setSubmitError(true);
      }
    } catch {
      if (alive.current) setSubmitError(true);
    } finally {
      submitting.current = false;
    }
  };
  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            <ScanLine size={15} aria-hidden="true" />
            {t("eyebrow")}
          </p>
          <h1>{t("title")}</h1>
          <p>{t("description")}</p>
        </div>
        <Link href="/dashboard/wardrobe/3d">
          <ArrowLeft size={15} />
          {t("back")}
        </Link>
      </header>
      <ol className={styles.steps}>
        {["upload", "selectionTitle", "generate"].map((key, index) => (
          <li key={key}>
            <span aria-hidden="true">{index + 1}</span>
            <strong>{t(key)}</strong>
          </li>
        ))}
      </ol>
      <div className={styles.room}>
        <div className={styles.mirrorColumn}>
          <div className={styles.photoSetup}>
            <div className={styles.photoActions}>
              <label className={styles.uploadButton} htmlFor="fitting-person">
                <Upload size={16} />
                {t(person ? "replacePhoto" : "upload")}
              </label>
              <input
                ref={input}
                className={styles.fileInput}
                id="fitting-person"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={data.isCreating || photoPending}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  event.currentTarget.value = "";
                  void choosePhoto(file);
                }}
                aria-label={t("upload")}
              />
              <Button
                variant="outline"
                disabled={data.isCreating}
                onClick={() => {
                  if (camera.stream || camera.pending) camera.stop();
                  else {
                    setConsent(false);
                    void camera.start();
                  }
                }}
              >
                <Camera size={16} />
                {t(
                  camera.stream || camera.pending ? "closeCamera" : "openCamera",
                )}
              </Button>
              {person && (
                <Button
                  variant="ghost"
                  disabled={data.isCreating}
                  onClick={() => void choosePhoto(null)}
                >
                  {t("removePhoto")}
                </Button>
              )}
            </div>
            <p className={styles.hint}>{t("photoHint")}</p>
            <p className={styles.hint}>{t("cameraHint")}</p>
            {photoError && (
              <p role="alert" className={styles.error}>
                {t("invalidPhoto")}
              </p>
            )}
            {(camera.error || captureError) && (
              <p role="alert" className={styles.error}>
                {t("cameraError")}
              </p>
            )}
          </div>
          <FittingMirror
            key={activeTask?.id ?? "draft"}
            photo={photo}
            task={activeTask}
            canCompare={canCompare}
            stream={camera.stream}
            cameraPending={camera.pending}
            generating={data.isCreating}
            onCapture={(video) => void capture(video)}
            onStop={camera.stop}
          />
          {photographicLooks.length > 0 && (
            <section className={styles.lookDeck} aria-label={t("lookDeck")}>
              <div className={styles.deckHeading}>
                <div>
                  <span>{t("lookDeckEyebrow")}</span>
                  <h3>{t("lookDeck")}</h3>
                </div>
                <div className={styles.deckControls}>
                  <button
                    type="button"
                    aria-label={t("previousLook")}
                    disabled={
                      lookIndex <= 0 ||
                      !!camera.stream ||
                      camera.pending ||
                      data.isCreating
                    }
                    onClick={() =>
                      setActiveTaskId(photographicLooks[lookIndex - 1].id)
                    }
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span>
                    {lookIndex < 0 ? "—" : lookIndex + 1} /{" "}
                    {photographicLooks.length}
                  </span>
                  <button
                    type="button"
                    aria-label={t("nextLook")}
                    disabled={
                      lookIndex >= photographicLooks.length - 1 ||
                      !!camera.stream ||
                      camera.pending ||
                      data.isCreating
                    }
                    onClick={() =>
                      setActiveTaskId(photographicLooks[lookIndex + 1].id)
                    }
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
              <div className={styles.lookThumbnails}>
                {photographicLooks.map((task, index) => (
                  <button
                    type="button"
                    key={task.id}
                    aria-label={t("lookThumbnail", { number: index + 1 })}
                    aria-pressed={task.id === activeTask?.id}
                    disabled={
                      !!camera.stream || camera.pending || data.isCreating
                    }
                    onClick={() => setActiveTaskId(task.id)}
                  >
                    <Image
                      src={task.resultImageUrl!}
                      width={72}
                      height={100}
                      unoptimized
                      alt=""
                    />
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </button>
                ))}
              </div>
              {activeTask?.status === "succeeded" && (
                <div className={styles.lookDetails}>
                  <p>{t("lookPieces")}</p>
                  <div className={styles.lookPieces}>
                    {resultGarments.map((item) => (
                      <div key={item.id}>
                        <RackItemPhoto item={item} name={name(item)} small />
                        <span>{name(item)}</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    disabled={data.isCreating}
                    onClick={() =>
                      changeSelection(
                        [...(activeTask.item_ids ?? [activeTask.item_id])],
                        resultGarments.length
                          ? fittingGroupForType(
                              resultGarments[resultGarments.length - 1].type,
                            )
                          : null,
                      )
                    }
                  >
                    {t("reuseLook")}
                  </Button>
                  <p className={styles.hint}>{t("reuseHint")}</p>
                </div>
              )}
            </section>
          )}
          {changed && (
            <p className={styles.notice} role="status">
              {t("selectionChanged")}
            </p>
          )}
        </div>
        <section
          className={styles.wardrobePanel}
          aria-label={t("selectionTitle")}
        >
          <div className={styles.sectionHeading}>
            <span>
              <Shirt size={19} />
            </span>
            <div>
              <h2>{t("selectionTitle")}</h2>
              <p>{t("selectionHint")}</p>
            </div>
          </div>
          <div className={styles.command}>
            <label htmlFor="fitting-command">{t("commandLabel")}</label>
            <div>
              <input
                id="fitting-command"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    applyCommand();
                  }
                }}
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder={t("commandPlaceholder")}
                disabled={data.isCreating}
              />
              <Button
                variant="outline"
                disabled={!command.trim() || data.isCreating}
                onClick={() => applyCommand()}
              >
                {t("applyCommand")}
              </Button>
            </div>
            <Checkbox
              checked={voiceConsent}
              disabled={data.isCreating || !voice.supported}
              onChange={(event) => {
                setVoiceConsent(event.currentTarget.checked);
                if (!event.currentTarget.checked) voice.stop();
              }}
              label={t("voiceConsent")}
            />
            <Button
              variant="ghost"
              disabled={!voice.supported || !voiceConsent || data.isCreating}
              onClick={voice.listening ? voice.stop : voice.start}
            >
              <Mic size={15} />
              {t(voice.listening ? "stopVoice" : "voice")}
            </Button>
            <p className={styles.hint}>{t("commandHint")}</p>
            {!voice.supported && (
              <p className={styles.hint}>{t("voiceUnsupported")}</p>
            )}
            {voice.error && (
              <p className={styles.error} role="alert">
                {t("voiceError")}
              </p>
            )}
            {commandNotice && (
              <p className={styles.hint} role="status">
                {t(commandNotice)}
              </p>
            )}
            {candidates.length > 0 && (
              <div className={styles.candidates}>
                {candidates.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    disabled={data.isCreating}
                    onClick={() => applyCandidate(item, candidateAction)}
                  >
                    {name(item)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div
            className={styles.groupTabs}
            role="group"
            aria-label={t("selectionTitle")}
          >
            <button
              type="button"
              aria-pressed={group === "all"}
              onClick={() => setGroup("all")}
            >
              {t("all")}
            </button>
            {FITTING_GROUPS.map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={group === value}
                onClick={() => setGroup(value)}
              >
                {tr(`groups.${value}`)}
              </button>
            ))}
          </div>
          <label className={styles.search} htmlFor="fitting-search">
            {t("search")}
            <input
              id="fitting-search"
              placeholder={t("searchPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {wardrobe.isLoading && <p role="status">{t("loadingWardrobe")}</p>}
          {wardrobe.isError && (
            <div role="alert">
              <p>{t("wardrobeError")}</p>
              <Button variant="outline" onClick={() => void wardrobe.refetch()}>
                {t("retry")}
              </Button>
            </div>
          )}
          <ul className={styles.garments}>
            {filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-label={t("chooseItem", { name: name(item) })}
                  aria-pressed={ids.includes(item.id)}
                  disabled={data.isCreating || photoPending}
                  onClick={() => toggle(item)}
                >
                  <RackItemPhoto item={item} name={name(item)} small />
                  <strong>{name(item)}</strong>
                  <small>{typeLabel(item.type)}</small>
                </button>
              </li>
            ))}
          </ul>
          {!wardrobe.isLoading && !filtered.length && (
            <p className={styles.hint}>{t("noGarments")}</p>
          )}
          {wardrobe.hasMore && (
            <Button
              variant="outline"
              disabled={wardrobe.isFetchingMore}
              onClick={() => void wardrobe.loadMore()}
            >
              {t("loadMore")}
            </Button>
          )}
          <section
            className={styles.chosen}
            aria-label={t("chosenCount", { count: ids.length })}
          >
            <div>
              <h3>{t("chosenCount", { count: ids.length })}</h3>
              <div className={styles.selectionActions}>
                <button
                  type="button"
                  disabled={data.isCreating || undoCount === 0}
                  onClick={undoSelection}
                >
                  <Undo2 size={13} />
                  {t("undoSelection")}
                </button>
                {ids.length > 0 && (
                  <button
                    type="button"
                    disabled={data.isCreating}
                    onClick={() => changeSelection([], null)}
                  >
                    {t("clearSelection")}
                  </button>
                )}
              </div>
            </div>
            <div className={styles.chips}>
              {ids.map((id) => {
                const item = selected.find((value) => value.id === id);
                const label = item ? name(item) : id.slice(0, 8);
                return (
                  <button
                    type="button"
                    key={id}
                    disabled={data.isCreating}
                    aria-label={t("removeItem", { name: label })}
                    onClick={() =>
                      changeSelection(ids.filter((value) => value !== id))
                    }
                  >
                    {label}
                    <X size={13} />
                  </button>
                );
              })}
            </div>
            {unresolved && (
              <div role="status">
                <p className={styles.error}>
                  {t(seeds.isLoading ? "seedLoading" : "seedError")}
                </p>
                {seeds.hasErrors && (
                  <Button variant="outline" onClick={() => void seeds.retry()}>
                    {t("retry")}
                  </Button>
                )}
              </div>
            )}
          </section>
          <div className={styles.submitPanel}>
            {data.isLoadingCapabilities && <p role="status">{ts("loading")}</p>}
            {data.capabilityError && (
              <div role="alert">
                <p>{t("capabilityError")}</p>
                <Button
                  variant="outline"
                  onClick={() => void data.refetchCapabilities()}
                >
                  {t("retry")}
                </Button>
              </div>
            )}
            {!data.isLoadingCapabilities &&
              !data.capabilityError &&
              !data.capabilities?.available && (
                <p role="status">{t("unavailable")}</p>
              )}
            {data.capabilities && (
              <p className={styles.provider}>
                {t("provider", {
                  provider: `${data.capabilities.provider} · ${data.capabilities.model}`,
                })}
              </p>
            )}
            <Checkbox
              label={t("consent")}
              checked={consent}
              disabled={data.isCreating}
              onChange={(event) => setConsent(event.currentTarget.checked)}
            />
            <Button
              disabled={blocked}
              onClick={() => void generate()}
              className={styles.generate}
            >
              {data.isCreating ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Sparkles size={17} />
              )}{" "}
              {t(data.isCreating ? "generating" : "generate")}
            </Button>
            {(submitError || data.error) && (
              <div className={styles.error} role="alert">
                <p>{t("generateError")}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    void data.refetchTasks().catch(() => {});
                  }}
                >
                  {t("refreshTasks")}
                </Button>
              </div>
            )}
            <p className={styles.hint}>{t("privacyHint")}</p>
          </div>
        </section>
      </div>
      <section className={styles.history} aria-label={t("historyTitle")}>
        <div className={styles.historyHeading}>
          <div>
            <h2>{t("historyTitle")}</h2>
            <p>{t("historyHint")}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => void data.refetchTasks().catch(() => {})}
          >
            {t("refreshTasks")}
          </Button>
        </div>
        {data.isLoadingTasks ? (
          <p role="status">{t("resultLoading")}</p>
        ) : !data.tasks.length ? (
          <p className={styles.hint}>{t("emptyHistory")}</p>
        ) : (
          <ul>
            {data.tasks.map((task, index) => (
              <li key={task.id}>
                <button
                  type="button"
                  aria-label={t("openResult", {
                    number: data.tasks.length - index,
                  })}
                  aria-pressed={task.id === activeTask?.id}
                  onClick={() => setActiveTaskId(task.id)}
                >
                  {task.resultImageUrl && (
                    <Image
                      className={styles.historyPhoto}
                      src={task.resultImageUrl}
                      width={240}
                      height={320}
                      unoptimized
                      alt={t("historyPhoto", {
                        number: data.tasks.length - index,
                      })}
                    />
                  )}
                  <span>
                    {t("resultName", { number: data.tasks.length - index })}
                  </span>
                  <strong>{ts(STATUS_KEYS[task.status])}</strong>
                  <small>
                    {t("selectedSummary", {
                      count: (task.item_ids ?? [task.item_id]).length,
                    })}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
