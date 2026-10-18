"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Checkbox, Select } from "@mantine/core";
import {
  Camera,
  Image as GalleryIcon,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { ItemPicker } from "@/components/shared/item-picker";
import { getActiveUserId, subscribeActiveSession } from "@/lib/api";
import { useWornLooks } from "@/lib/hooks/use-worn-looks";
import { useTryOn } from "@/lib/hooks/use-tryon";
import { useInspirationWardrobe } from "@/lib/hooks/use-inspiration-wardrobe";
import { useTypeLabel } from "@/lib/hooks/use-translated-constants";
import {
  MAX_LOOK_ITEMS,
  MAX_WORN_LOOKS,
  LookStorageError,
  type WornLookPreview,
} from "@/lib/looks/types";
import type { TryOnCapabilities, TryOnStatus } from "@/lib/looks/tryon-types";
import { LookSwitcher } from "./look-switcher";
import { StyleDiscovery } from "./style-discovery";
import styles from "./workspace.module.css";

type PendingPhoto = { id: string; file: File; name: string };
type TryOnData = ReturnType<typeof useTryOn>;
const STATUS_KEYS: Record<TryOnStatus, string> = {
  submitting: "starting",
  queued: "queued",
  processing: "running",
  succeeded: "succeeded",
  failed: "failed",
};

function WornLooksPanel() {
  const t = useTranslations("dashboard.looks");
  const tc = useTranslations("common");
  const store = useWornLooks();
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [itemIds, setItemIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteLook, setDeleteLook] = useState<WornLookPreview | null>(null);
  const inFlight = useRef(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const errorText = (failure: unknown) =>
    failure instanceof LookStorageError
      ? t(`worn.errors.${failure.code}`)
      : t("worn.error");

  const addPhotos = async () => {
    if (inFlight.current || !photos.length) return;
    inFlight.current = true;
    setAdding(true);
    setError(null);
    const failed = new Set<string>();
    let lastError = "";
    try {
      for (const photo of photos) {
        try {
          await store.create({
            photoBlob: photo.file,
            name: photo.name,
            itemIds: Array.from(itemIds),
          });
        } catch (failure) {
          failed.add(photo.id);
          lastError = errorText(failure);
        }
      }
      setPhotos((current) => current.filter((photo) => failed.has(photo.id)));
      if (photoInput.current) photoInput.current.value = "";
      if (failed.size)
        setError(
          `${t("worn.partialError", { count: failed.size })} ${lastError}`,
        );
      else setItemIds(new Set());
    } finally {
      inFlight.current = false;
      setAdding(false);
    }
  };
  const removePhoto = async () => {
    if (!deleteLook || inFlight.current) return;
    inFlight.current = true;
    setDeleting(true);
    setError(null);
    try {
      await store.remove(deleteLook.id);
      setDeleteLook(null);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      inFlight.current = false;
      setDeleting(false);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="worn-title">
      <div className={styles.sectionHeading}>
        <span className={styles.badge}>
          <Camera size={22} aria-hidden="true" />
        </span>
        <div>
          <h2 id="worn-title">{t("worn.title")}</h2>
          <p>{t("worn.description")}</p>
        </div>
      </div>
      <p className={styles.notice}>{t("worn.localOnly")}</p>
      {store.isLoading ? (
        <p role="status">{tc("loading")}</p>
      ) : store.looks.length ? (
        <>
          <LookSwitcher
            looks={store.looks.map((look) => ({
              id: look.id,
              name: look.name,
              src: look.photoUrl,
            }))}
          />
          <ul className={styles.savedList}>
            {store.looks.map((look) => (
              <li key={look.id}>
                <span>{look.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("worn.delete")}
                  disabled={store.isSaving || adding || deleting}
                  onClick={() => setDeleteLook(look)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  {t("worn.delete")}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className={styles.empty}>{t("worn.empty")}</p>
      )}
      {(error || store.error) && (
        <p className={styles.error} role="alert">
          {error || errorText(store.error)}
        </p>
      )}
      {store.error && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void store.refetch();
          }}
        >
          {t("tryon.retry")}
        </Button>
      )}
      <div className={styles.uploadForm}>
        <label className={styles.fileLabel} htmlFor="worn-photos">
          <Upload size={18} aria-hidden="true" />
          {t("worn.photos")}
        </label>
        <input
          ref={photoInput}
          id="worn-photos"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          disabled={adding || store.isLoading}
          onChange={(event) => {
            if (inFlight.current) return;
            const files = Array.from(event.currentTarget.files ?? []);
            setPhotos(
              files.map((file) => ({
                id: crypto.randomUUID(),
                file,
                name: file.name.replace(/\.[^/.]+$/, "").slice(0, 100),
              })),
            );
            setError(null);
          }}
        />
        <p className={styles.hint}>{t("worn.limit")}</p>
        {photos.map((photo, index) => (
          <div className={styles.pendingPhoto} key={photo.id}>
            <Input
              aria-label={t("worn.name", { index: index + 1 })}
              value={photo.name}
              maxLength={100}
              disabled={adding}
              onChange={(event) => {
                const name = event.currentTarget.value;
                setPhotos((current) =>
                  current.map((entry) =>
                    entry.id === photo.id ? { ...entry, name } : entry,
                  ),
                );
              }}
            />
            <span>{photo.file.name}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={adding}
              onClick={() =>
                setPhotos((current) =>
                  current.filter((entry) => entry.id !== photo.id),
                )
              }
            >
              {t("worn.cancel")}
            </Button>
          </div>
        ))}
        {photos.length > 0 && (
          <>
            <details className={styles.association}>
              <summary>{t("worn.associate")}</summary>
              <fieldset
                disabled={adding || store.isSaving || deleting}
                aria-label={t("worn.associate")}
                style={{
                  border: 0,
                  padding: 0,
                  margin: 0,
                  minWidth: 0,
                  opacity: adding || store.isSaving || deleting ? 0.55 : 1,
                }}
              >
                <ItemPicker
                  selectedIds={itemIds}
                  heightClass="h-[260px]"
                  onToggle={(item) => {
                    if (
                      inFlight.current ||
                      adding ||
                      store.isSaving ||
                      deleting
                    )
                      return;
                    setItemIds((current) => {
                      const next = new Set(current);
                      if (next.has(item.id)) next.delete(item.id);
                      else if (next.size < MAX_LOOK_ITEMS) next.add(item.id);
                      return next;
                    });
                  }}
                />
              </fieldset>
            </details>
            <Button
              onClick={() => {
                void addPhotos();
              }}
              disabled={
                adding ||
                store.isSaving ||
                photos.some((photo) => !photo.name.trim()) ||
                store.looks.length >= MAX_WORN_LOOKS
              }
            >
              {adding ? (
                <Loader2
                  size={16}
                  className={styles.spinner}
                  aria-hidden="true"
                />
              ) : (
                <Upload size={16} aria-hidden="true" />
              )}
              {t(adding ? "worn.adding" : "worn.add")}
            </Button>
          </>
        )}
      </div>
      <AlertDialog
        open={!!deleteLook}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteLook(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("worn.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("worn.deleteDescription", { name: deleteLook?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("worn.cancel")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                void removePhoto();
              }}
            >
              {t("worn.confirmDelete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function TryOnForm({
  data,
  capabilities,
}: {
  data: TryOnData;
  capabilities: TryOnCapabilities;
}) {
  const t = useTranslations("dashboard.looks");
  const ti = useTranslations("dashboard.inspiration");
  const typeLabel = useTypeLabel();
  const inventory = useInspirationWardrobe();
  const [personPhoto, setPersonPhoto] = useState<File | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(false);
  const submitting = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tops = inventory.items.filter((item) =>
    capabilities.supported_item_types.includes(item.type),
  );
  const selected = tops.find((item) => item.id === itemId);
  const submit = async () => {
    if (
      submitting.current ||
      data.isCreating ||
      inventory.isLoading ||
      inventory.isError ||
      !capabilities.available ||
      !personPhoto ||
      !selected ||
      !consent
    )
      return;
    submitting.current = true;
    setError(false);
    try {
      await data.create({ personPhoto, itemId: selected.id, consent: true });
      setPersonPhoto(null);
      setConsent(false);
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setError(true);
    } finally {
      submitting.current = false;
    }
  };
  return (
    <div className={styles.uploadForm}>
      <p className={styles.provider}>
        {t("tryon.sendNotice", {
          provider: `${capabilities.provider} · ${capabilities.model}`,
        })}
      </p>
      <label className={styles.fileLabel} htmlFor="tryon-person">
        {t("tryon.personPhoto")}
      </label>
      <input
        ref={inputRef}
        id="tryon-person"
        type="file"
        accept={capabilities.accepted_mime_types.join(",")}
        disabled={data.isCreating}
        onChange={(event) => {
          if (capabilities.available && !submitting.current)
            setPersonPhoto(event.currentTarget.files?.[0] ?? null);
        }}
      />
      <Select
        label={t("tryon.garment")}
        placeholder={t("tryon.chooseGarment")}
        value={selected?.id ?? null}
        data={tops.map((item) => ({
          value: item.id,
          label: item.name || typeLabel(item.type),
        }))}
        searchable
        allowDeselect={false}
        disabled={data.isCreating || inventory.isLoading || inventory.isError}
        onChange={setItemId}
      />
      <p className={styles.hint}>{t("tryon.unsupported")}</p>
      {inventory.isError && (
        <div role="status">
          <p className={styles.error}>{t("tryon.error")}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void inventory.refetch();
            }}
          >
            {t("tryon.retry")}
          </Button>
        </div>
      )}
      {inventory.hasMore && (
        <div className={styles.inlineControls}>
          <p className={styles.hint}>
            {ti("partial", {
              loaded: inventory.items.length,
              total: inventory.total,
            })}
          </p>
          <Button
            variant="ghost"
            size="sm"
            disabled={inventory.isFetchingMore}
            onClick={() => {
              void inventory.loadMore();
            }}
          >
            {ti(inventory.isFetchingMore ? "loadingMore" : "loadMore")}
          </Button>
        </div>
      )}
      <Checkbox
        label={t("tryon.consent")}
        checked={consent}
        disabled={data.isCreating}
        onChange={(event) => setConsent(event.currentTarget.checked)}
      />
      <Button
        disabled={
          data.isCreating ||
          inventory.isLoading ||
          inventory.isError ||
          !personPhoto ||
          !selected ||
          !consent
        }
        onClick={() => {
          void submit();
        }}
      >
        {data.isCreating ? (
          <Loader2 size={16} className={styles.spinner} aria-hidden="true" />
        ) : (
          <Sparkles size={16} aria-hidden="true" />
        )}
        {t(data.isCreating ? "tryon.starting" : "tryon.start")}
      </Button>
      {error && (
        <p className={styles.error} role="alert">
          {t("tryon.error")}
        </p>
      )}
    </div>
  );
}

function TryOnPanel() {
  const t = useTranslations("dashboard.looks");
  const tc = useTranslations("common");
  const data = useTryOn();
  const results = data.tasks.filter(
    (task) => task.status === "succeeded" && task.resultImageUrl,
  );
  return (
    <section className={styles.panel} aria-labelledby="tryon-title">
      <div className={styles.sectionHeading}>
        <span className={`${styles.badge} ${styles.lavender}`}>
          <Sparkles size={22} aria-hidden="true" />
        </span>
        <div>
          <h2 id="tryon-title">{t("tryon.title")}</h2>
          <p>{t("tryon.description")}</p>
        </div>
      </div>
      {data.isLoadingCapabilities ? (
        <p role="status">{t("tryon.loading")}</p>
      ) : data.capabilityError ? (
        <div role="status">
          <p className={styles.error}>{t("tryon.loadError")}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void data.refetchCapabilities();
            }}
          >
            {t("tryon.retry")}
          </Button>
        </div>
      ) : null}
      {data.capabilities?.available ? (
        <TryOnForm data={data} capabilities={data.capabilities} />
      ) : (
        <div className={styles.uploadForm}>
          {!data.isLoadingCapabilities && !data.capabilityError && (
            <p className={styles.notice} role="status">
              {t("tryon.unavailable")}
            </p>
          )}
          <label className={styles.fileLabel} htmlFor="tryon-disabled-person">
            {t("tryon.personPhoto")}
          </label>
          <input
            id="tryon-disabled-person"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled
          />
          <Button disabled>{t("tryon.start")}</Button>
        </div>
      )}
      <div className={styles.resultHeading}>
        <h3>{t("tryon.result")}</h3>
        {(data.error || data.tasks.some((task) => task.resultImageError)) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void data.refetchTasks();
            }}
          >
            {t("tryon.retry")}
          </Button>
        )}
      </div>
      {data.isLoadingTasks && <p role="status">{tc("loading")}</p>}
      {data.error && (
        <p className={styles.error} role="alert">
          {t("tryon.error")}
        </p>
      )}
      {results.length > 0 && (
        <LookSwitcher
          notice={t("tryon.generatedNotice")}
          looks={results.map((task, index) => ({
            id: task.id,
            name: `${t("tryon.result")} ${index + 1}`,
            src: task.resultImageUrl!,
          }))}
        />
      )}
      {!data.isLoadingTasks && !data.tasks.length && (
        <p className={styles.empty}>{t("tryon.empty")}</p>
      )}
      <ul className={styles.taskList}>
        {data.tasks.map((task, index) => (
          <li key={task.id}>
            <strong>
              {t("tryon.result")} {data.tasks.length - index}
            </strong>
            <span role="status">{t(`tryon.${STATUS_KEYS[task.status]}`)}</span>
            {(task.status === "failed" || task.resultImageError) && (
              <p className={styles.error}>{t("tryon.error")}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SessionLooksWorkspace() {
  const t = useTranslations("dashboard.looks");
  const [tab, setTab] = useState("model");
  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>
          <GalleryIcon size={16} aria-hidden="true" />
          {t("discovery.eyebrow")}
        </p>
        <h1>{t("discovery.title")}</h1>
        <p>{t("discovery.description")}</p>
      </header>
      <Tabs value={tab} onValueChange={setTab} keepMounted>
        <TabsList className={styles.tabs} aria-label={t("title")}>
          <TabsTrigger
            value="model"
            leftSection={<GalleryIcon size={16} aria-hidden="true" />}
          >
            {t("tabs.model")}
          </TabsTrigger>
          <TabsTrigger
            value="worn"
            leftSection={<Camera size={16} aria-hidden="true" />}
          >
            {t("tabs.worn")}
          </TabsTrigger>
          <TabsTrigger
            value="tryon"
            leftSection={<Sparkles size={16} aria-hidden="true" />}
          >
            {t("tabs.tryon")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="model">
          <StyleDiscovery />
        </TabsContent>
        <TabsContent value="worn">
          <WornLooksPanel />
        </TabsContent>
        <TabsContent value="tryon">
          <TryOnPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function LooksWorkspace() {
  const owner = useSyncExternalStore(
    subscribeActiveSession,
    getActiveUserId,
    () => null,
  );
  const [epoch, setEpoch] = useState(0);
  const previousOwner = useRef(owner);
  useEffect(() => {
    const sync = () => {
      const nextOwner = getActiveUserId();
      if (previousOwner.current === nextOwner) return;
      previousOwner.current = nextOwner;
      setEpoch((value) => value + 1);
    };
    sync();
    return subscribeActiveSession(sync);
  }, []);
  return <SessionLooksWorkspace key={`${owner ?? "signed-out"}:${epoch}`} />;
}
