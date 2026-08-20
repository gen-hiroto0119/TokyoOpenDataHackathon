import type { Meta, StoryObj } from "@storybook/react-vite";
import { RoomCreate } from "./RoomCreate.js";
import { figma } from "../figma.js";

const meta = {
  title: "Screens / 1 ルーム作成",
  component: RoomCreate,
  parameters: {
    layout: "fullscreen",
    design: { type: "figma", url: figma.screen1 },
  },
} satisfies Meta<typeof RoomCreate>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
