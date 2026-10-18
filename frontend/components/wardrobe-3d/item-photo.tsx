"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Shirt } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Item } from "@/lib/types";
import styles from "./workspace.module.css";

export function RackItemPhoto({
  item,
  name,
  small = false,
}: {
  item: Item;
  name: string;
  small?: boolean;
}) {
  const t = useTranslations("wardrobe.rack");
  const url = small
    ? item.thumbnail_url || item.medium_url || item.image_url
    : item.medium_url || item.image_url || item.thumbnail_url;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <div className={styles.itemPhoto}>
      {url && !failed ? (
        <Image
          src={url}
          alt={name}
          fill
          unoptimized
          sizes={small ? "100px" : "360px"}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={styles.noPhoto}>
          <Shirt size={28} aria-hidden="true" />
          <span>{t("noPhoto")}</span>
        </span>
      )}
    </div>
  );
}
