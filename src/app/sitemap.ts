import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";
import { DATA_CHECKED } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, lastModified: DATA_CHECKED, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/calculator`, lastModified: DATA_CHECKED, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/ranks`, lastModified: DATA_CHECKED, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
