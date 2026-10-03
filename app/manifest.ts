import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Isvak",
    short_name: "Isvak",
    description: "Datadriven bevakning av isbildning",
    lang: "sv",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0c1015",
    theme_color: "#0c1015",
    icons: [
      { src: "/brand/logo-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/logo-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/logo-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
