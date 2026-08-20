import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrivalInfo } from "./ArrivalInfo.js";
import { figma } from "../figma.js";

const meta = {
  title: "Screens / 3 到着情報",
  component: ArrivalInfo,
  parameters: {
    layout: "fullscreen",
    design: { type: "figma", url: figma.screen3 },
  },
} satisfies Meta<typeof ArrivalInfo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
