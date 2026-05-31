'use client';

interface GlyphProps {
  ch: string;
  color: string;
  size?: number;
}

export function Glyph({ ch, color, size = 38 }: GlyphProps) {
  return (
    <div
      className="ico"
      style={{
        background: color,
        width: size,
        height: size,
        borderRadius: size * 0.29,
      }}
    >
      {ch}
    </div>
  );
}
