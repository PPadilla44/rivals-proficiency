import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Same gold shield as icon.svg, on the site's dark panel colour for iOS home screens.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#12151c" }}>
        <svg width="132" height="132" viewBox="0 0 32 32">
          <path d="M16 5.2 25 8.6v6.3c0 5.4-3.8 9.3-9 11-5.2-1.7-9-5.6-9-11V8.6z" fill="#f2b531" />
          <path d="M11.2 15.2 16 11.2l4.8 4v3.1L16 14.3l-4.8 4z" fill="#12151c" />
        </svg>
      </div>
    ),
    size,
  );
}
