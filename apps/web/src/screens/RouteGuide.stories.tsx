import type { Meta, StoryObj } from "@storybook/react-vite";
import { RouteGuide } from "./RouteGuide.js";
import { figma } from "../figma.js";

const meta = {
  title: "Screens / 6 経路",
  component: RouteGuide,
  parameters: {
    layout: "fullscreen",
    design: { type: "figma", url: figma.screen6 },
  },
} satisfies Meta<typeof RouteGuide>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
