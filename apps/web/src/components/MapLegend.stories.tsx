import type { Meta, StoryObj } from "@storybook/react-vite";
import { MapLegend } from "./Map.js";
import { figma } from "../figma.js";

const meta = {
  title: "Map / Legend",
  component: MapLegend,
  parameters: {
    design: { type: "figma", url: figma.mapLegend },
  },
} satisfies Meta<typeof MapLegend>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
