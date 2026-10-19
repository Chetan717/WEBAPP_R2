import { Circle, Group, Image } from "react-konva";

// Canvas layers are included in both the live preview and exported image/video.
export default function CompanyLogoCanvas({ image, x, y, width, height }) {
  if (!image) return null;

  return (
    <Group listening={false}>
      <Group
        x={x + width / 2}
        y={y + height / 2}
        scaleX={width / 2 + 7}
        scaleY={height / 2 + 8}
      >
        {/* <Circle
          radius={1}
          fillRadialGradientStartPoint={{ x: 0, y: 0 }}
          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
          fillRadialGradientStartRadius={0}
          fillRadialGradientEndRadius={1}
          fillRadialGradientColorStops={[
            0,
            "rgba(238, 229, 229, 0.68)",
            0.45,
            "rgba(238, 229, 229, 0.68)",
            0.75,
            "rgba(238, 229, 229, 0.68)",
            1,
            "rgba(238, 229, 229, 0.68)",
          ]}
        /> */}
      </Group>
      <Image image={image} x={x} y={y} width={width} height={height} />
    </Group>
  );
}
