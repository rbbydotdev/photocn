/**
 * Social / README images, rendered with Takumi (JSX → PNG, no browser).
 *
 * Direction: a darkroom lit by one acid-yellow safelight. Near-black ground,
 * a single sharp chartreuse glow, white type. Acid yellow is the only accent
 * and marks what a developer acts on: the `$` of the install command and the
 * crop handles framing the product (the editor's own crop UI).
 *
 * Used by scripts/og.tsx (banner.png, og.png, og/docs/*.png).
 */

export const ACID = "#d4ff00";
const INK = "#09090a";
const PAPER = "#f5f5f4";
const MUTED = "#a1a1aa";
const LINE = "rgba(245,245,244,0.14)";

export const TAGLINE = "The photo editor for shadcn/ui";
/**
 * The URL form works in any shadcn project today, with no registry setup.
 * Switch to `npx shadcn add @photocn/image-editor` once @photocn is listed
 * in the shadcn registry directory.
 */
export const installCommand = (item: string) => `npx shadcn add https://photocn.dev/r/${item}.json`;
export const INSTALL = installCommand("image-editor");
const STACK = ["React", "TypeScript", "WebGL", "Tailwind"];

/** Acid safelight in the top-right, a faint bounce bottom-left, vignette. */
const darkroom = [
  "radial-gradient(42% 58% at 96% 0%, rgba(212,255,0,0.42) 0%, rgba(212,255,0,0.12) 38%, rgba(9,9,10,0) 72%)",
  "radial-gradient(38% 50% at 0% 100%, rgba(212,255,0,0.08) 0%, rgba(9,9,10,0) 70%)",
  `linear-gradient(180deg, #111113 0%, ${INK} 100%)`,
].join(", ");

function Logo({ size }: { size: number }) {
  return (
    <svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <rect height="18" rx="4" stroke={PAPER} strokeWidth="2" width="18" x="3" y="3" />
      <path d="m3 16 5-5 4 4 3-3 6 6" stroke={PAPER} strokeLinejoin="round" strokeWidth="2" />
      <circle cx="15.5" cy="8.5" fill={ACID} r="1.6" />
    </svg>
  );
}

/** The editor's crop handles, in the accent color. */
function CropHandles({ inset = -7, size = 14 }: { inset?: number; size?: number }) {
  const handle = (style: Record<string, number | string>) => (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: ACID,
        boxShadow: "0 0 0 2px rgba(9,9,10,0.9)",
        ...style,
      }}
    />
  );
  return (
    <>
      {handle({ top: inset, left: inset })}
      {handle({ top: inset, right: inset })}
      {handle({ bottom: inset, left: inset })}
      {handle({ bottom: inset, right: inset })}
    </>
  );
}

function Command({ fontSize }: { fontSize: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: fontSize * 0.6,
        padding: `${fontSize * 0.55}px ${fontSize * 0.9}px`,
        borderRadius: fontSize * 0.5,
        border: `1.5px solid ${LINE}`,
        backgroundColor: "rgba(9,9,10,0.75)",
        fontFamily: "Geist Mono",
        fontSize,
        color: PAPER,
      }}
    >
      <span style={{ color: ACID }}>$</span>
      <span>{INSTALL}</span>
    </div>
  );
}

function Stack({ fontSize }: { fontSize: number }) {
  return (
    <div style={{ display: "flex", gap: fontSize * 0.5, fontFamily: "Geist Mono", fontSize, color: MUTED }}>
      {STACK.map((item, i) => (
        <span key={item} style={{ display: "flex", gap: fontSize * 0.5 }}>
          {i > 0 ? <span style={{ color: ACID }}>·</span> : null}
          {item}
        </span>
      ))}
    </div>
  );
}

/** README banner and site OG image. */
export function Banner({
  screenshot,
  width = 1280,
  height = 640,
}: {
  /** data: URI of a product screenshot (dark theme), ideally 16:10. */
  screenshot: string;
  width?: number;
  height?: number;
}) {
  const unit = height / 640;
  const shotWidth = Math.round(width * 0.8);
  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        backgroundImage: darkroom,
        color: PAPER,
        fontFamily: "Geist",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 * unit, marginTop: 40 * unit }}>
        <Logo size={62 * unit} />
        <div style={{ fontSize: 76 * unit, fontWeight: 700, letterSpacing: "-0.045em" }}>photocn</div>
      </div>
      <div style={{ fontSize: 42 * unit, fontWeight: 500, letterSpacing: "-0.025em", marginTop: 6 * unit }}>
        {TAGLINE}
      </div>
      <div style={{ display: "flex", marginTop: 20 * unit }}>
        <Command fontSize={27 * unit} />
      </div>
      <div style={{ display: "flex", marginTop: 16 * unit }}>
        <Stack fontSize={26 * unit} />
      </div>
      <div
        style={{
          position: "absolute",
          left: (width - shotWidth) / 2,
          top: Math.round(height * 0.58),
          width: shotWidth,
          display: "flex",
        }}
      >
        <img
          src={screenshot}
          style={{
            width: shotWidth,
            borderRadius: 14,
            border: `1px solid ${LINE}`,
            boxShadow: "0 -20px 80px rgba(0,0,0,0.65)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: `1.5px solid ${ACID}`,
            borderRadius: 14,
            display: "flex",
          }}
        >
          <CropHandles />
        </div>
      </div>
    </div>
  );
}

/** Per-page docs OG image: section, title, description, install command. */
export function DocOg({
  section,
  title,
  description,
  item,
  width = 1200,
  height = 630,
}: {
  section: string;
  title: string;
  description: string;
  /** Registry item, shown as its install command. */
  item?: string;
  width?: number;
  height?: number;
}) {
  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        backgroundImage: darkroom,
        color: PAPER,
        fontFamily: "Geist",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Logo size={50} />
        <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.04em" }}>photocn</div>
        <div style={{ fontSize: 34, color: MUTED, marginLeft: 6, fontFamily: "Geist Mono" }}>/ {section.toLowerCase()}</div>
        <div style={{ flexGrow: 1 }} />
        <div style={{ fontSize: 30, color: MUTED, fontFamily: "Geist Mono" }}>photocn.dev</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22, position: "relative", padding: "30px 34px" }}>
        <div style={{ position: "absolute", inset: 0, border: `1.5px solid ${ACID}`, display: "flex" }}>
          <CropHandles />
        </div>
        <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.02 }}>{title}</div>
        <div style={{ fontSize: 36, color: "#c4c4c9", lineHeight: 1.3 }}>{description}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        {item ? (
          <div style={{ display: "flex", gap: 16, fontFamily: "Geist Mono", fontSize: 30, lineHeight: 1.35 }}>
            <span style={{ color: ACID }}>$</span>
            {/* Long item URLs wrap after "add" rather than shrinking. */}
            {installCommand(item).length > 50 ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span>npx shadcn add</span>
                <span>{installCommand(item).slice("npx shadcn add ".length)}</span>
              </div>
            ) : (
              <span>{installCommand(item)}</span>
            )}
          </div>
        ) : (
          <Stack fontSize={30} />
        )}
      </div>
    </div>
  );
}
