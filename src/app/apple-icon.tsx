import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Same shield as icon.svg, on a dark tile for iOS home screens.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0f1c" }}>
        <svg width="132" height="132" viewBox="0 0 32 32">
          <path d="M16 2.5 28 7.2v8.3c0 7.1-5 12.2-12 14.5C9 27.7 4 22.6 4 15.5V7.2z" fill="#ffce1f" stroke="#121217" strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M9.5 15.5 16 10l6.5 5.5v4L16 14l-6.5 5.5z" fill="#121217" />
        </svg>
      </div>
    ),
    size,
  );
}
