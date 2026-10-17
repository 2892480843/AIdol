"use client";

import * as React from "react";
import { Avatar as MantineAvatar, Image, Box } from "@mantine/core";

const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ImgHTMLAttributes<HTMLImageElement>
>((props, ref) => (
  <Image ref={ref} data-ui="avatar-image" alt={props.alt ?? ""} {...props} />
));
const AvatarFallback = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { delayMs?: number }
>(({ delayMs, ...props }, ref) => (
  <Box component="span" ref={ref} data-ui="avatar-fallback" {...props} />
));

function isImage(
  node: React.ReactNode,
): node is React.ReactElement<React.ImgHTMLAttributes<HTMLImageElement>> {
  if (!React.isValidElement(node)) return false;
  // Fast Refresh can retain an earlier forwardRef identity in an existing tree.
  return (
    node.type === AvatarImage ||
    (node.type as { displayName?: string }).displayName === "AvatarImage"
  );
}

const Avatar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  const nodes = React.Children.toArray(children);
  const image = nodes.find(isImage);
  const { src, alt, ...imageProps } = image?.props ?? {};
  const imageRef = (
    image as unknown as
      | { ref?: React.ForwardedRef<HTMLImageElement> }
      | undefined
  )?.ref;
  const fallback = nodes.filter((node) => !isImage(node));
  const legacySize = className?.match(/(?:^|\s)h-(\d+(?:\.\d+)?)(?:\s|$)/)?.[1];

  return (
    <MantineAvatar
      ref={ref}
      data-ui="avatar"
      className={className}
      size={legacySize ? `${Number(legacySize) * 0.25}rem` : undefined}
      src={src?.trim() || null}
      alt={alt}
      imageProps={{ ...imageProps, ...(imageRef ? { ref: imageRef } : {}) }}
      {...props}
    >
      {fallback.length ? fallback : undefined}
    </MantineAvatar>
  );
});
Avatar.displayName = "Avatar";
AvatarImage.displayName = "AvatarImage";
AvatarFallback.displayName = "AvatarFallback";
export { Avatar, AvatarImage, AvatarFallback };
