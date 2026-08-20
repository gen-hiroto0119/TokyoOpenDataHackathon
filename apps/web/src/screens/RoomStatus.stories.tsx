import type { Meta, StoryObj } from "@storybook/react-vite";
import { RoomStatus } from "./RoomStatus.js";
import { figma } from "../figma.js";

const meta = {
  title: "Screens / 4 ルーム",
  component: RoomStatus,
  parameters: {
    layout: "fullscreen",
    design: { type: "figma", url: figma.screen4 },
  },
} satisfies Meta<typeof RoomStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
