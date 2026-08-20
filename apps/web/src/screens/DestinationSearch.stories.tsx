import type { Meta, StoryObj } from "@storybook/react-vite";
import { DestinationSearch } from "./DestinationSearch.js";
import { figma } from "../figma.js";

const meta = {
  title: "Screens / 1b 行き先の検索",
  component: DestinationSearch,
  parameters: {
    layout: "fullscreen",
    design: { type: "figma", url: figma.screen1b },
  },
} satisfies Meta<typeof DestinationSearch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
