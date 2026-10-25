"use client";

import bodyData from "./body_html.json";

export default function HomePage() {
  return (
    <div
      id="app-root-container"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: bodyData.html }}
    />
  );
}
