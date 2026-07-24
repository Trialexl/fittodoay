import localFont from "next/font/local";
import { Suspense } from "react";

import { HomePageClient } from "@/components/home/HomePageClient";

const greetingFont = localFont({
  src: "../../public/fonts/Christopher.otf",
  display: "swap",
});

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageClient greetingFontClassName={greetingFont.className} />
    </Suspense>
  );
}
