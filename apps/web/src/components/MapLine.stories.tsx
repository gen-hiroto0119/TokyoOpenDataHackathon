import type { Meta, StoryObj } from "@storybook/react-vite";
import { MapLine } from "./Map.js";
import { figma } from "../figma.js";

const meta = {
  title: "Map / Line",
  component: MapLine,
  argTypes: {
    Kind: { control: "select", options: ["Context", "Muted", "Selected"] },
  },
  args: {
    Kind: "Context",
  },
  parameters: {
    design: { type: "figma", url: figma.mapLine },
  },
} satisfies Meta<typeof MapLine>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Context: Story = {};

export const Muted: Story = {
  args: { Kind: "Muted" },
};

export const Selected: Story = {
  args: { Kind: "Selected" },
};
