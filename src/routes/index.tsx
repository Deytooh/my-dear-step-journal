import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "나의 GLP-1 저널 · my dear step" },
    { name: "description", content: "체중, 주사와 작은 순간을 기록하는 나의 개인 저널." },
    { property: "og:title", content: "나의 GLP-1 저널 · my dear step" },
    { property: "og:description", content: "체중, 주사와 작은 순간을 함께 기록하세요." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => { throw redirect({ to: "/today" }); },
});
