import { notFound } from "next/navigation";
import { ENABLE_DEMO_ROUTES, DEMO_RESET_ENABLED, DEMO_RACE_SEAT_COUNT } from "@/lib/config";
import { DemoClient } from "./DemoClient";

export default function DemoPage() {
  if (!ENABLE_DEMO_ROUTES) notFound();
  return <DemoClient resetEnabled={DEMO_RESET_ENABLED} raceSeatCount={DEMO_RACE_SEAT_COUNT} />;
}
