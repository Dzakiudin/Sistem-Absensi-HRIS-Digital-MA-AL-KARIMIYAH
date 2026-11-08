"use client";

import { Section } from "@astryxdesign/core/Section";
import bodyData from "./body_html.json";
import { useMountAppBody } from "../src/mountAppBody";

export default function HomePage() {
  const mountRef = useMountAppBody(bodyData.html);

  return (
    <Section
      ref={mountRef}
      variant="transparent"
      padding={0}
    />
  );
}
