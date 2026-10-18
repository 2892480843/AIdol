import { FittingRoomWorkspace } from "@/components/fitting-room/workspace";
import { parseFittingSeed } from "@/lib/fitting-seed";
export default function FittingRoomPage({
  searchParams,
}: {
  searchParams: { items?: string | string[] };
}) {
  return (
    <FittingRoomWorkspace initialIds={parseFittingSeed(searchParams.items)} />
  );
}
