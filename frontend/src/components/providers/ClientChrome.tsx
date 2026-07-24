"use client";

import dynamic from "next/dynamic";

const OfflineBanner = dynamic(
  () =>
    import("@/components/common/OfflineBanner").then(
      (module) => module.OfflineBanner,
    ),
  { ssr: false },
);
const AppHeader = dynamic(
  () =>
    import("@/components/common/AppHeader").then((module) => module.AppHeader),
  { ssr: false },
);
const GlobalMusicPlayer = dynamic(
  () =>
    import("@/components/common/GlobalMusicPlayer").then(
      (module) => module.GlobalMusicPlayer,
    ),
  { ssr: false },
);

export const ClientChrome = ({
  position,
}: {
  position: "before" | "after";
}) =>
  position === "before" ? (
    <>
      <OfflineBanner />
      <AppHeader />
    </>
  ) : (
    <GlobalMusicPlayer />
  );
