import type { Meta, StoryObj } from "@storybook/react-vite";
import { GettingStarted } from "./GettingStarted.js";
import { figma } from "../figma.js";

const meta = {
  title: "Screens / 0 はじめに",
  component: GettingStarted,
  parameters: {
    layout: "fullscreen",
    design: { type: "figma", url: figma.screen0 },
  },
} satisfies Meta<typeof GettingStarted>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
