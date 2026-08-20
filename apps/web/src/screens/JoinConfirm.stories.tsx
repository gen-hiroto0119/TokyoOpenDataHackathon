import type { Meta, StoryObj } from "@storybook/react-vite";
import { JoinConfirm } from "./JoinConfirm.js";
import { figma } from "../figma.js";

const meta = {
  title: "Screens / 2 参加の確認",
  component: JoinConfirm,
  parameters: {
    layout: "fullscreen",
    design: { type: "figma", url: figma.screen2 },
  },
} satisfies Meta<typeof JoinConfirm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
