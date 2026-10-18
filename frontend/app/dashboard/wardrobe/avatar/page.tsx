import { AvatarWorkspace } from "@/components/avatar-studio/workspace";
import { parseFittingSeed } from "@/lib/fitting-seed";

export default function AvatarPage({
  searchParams,
}: {
  searchParams: { items?: string | string[] };
}) {
  return <AvatarWorkspace initialIds={parseFittingSeed(searchParams.items)} />;
}
