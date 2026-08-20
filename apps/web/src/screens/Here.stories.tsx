import type { Meta, StoryObj } from "@storybook/react-vite";
import { Here } from "./Here.js";
import { figma } from "../figma.js";

const meta = {
  title: "Screens / 7 いまいる場所",
  component: Here,
  argTypes: {
    Kind: { control: "select", options: ["Default", "List", "Ask", "Denied"] },
  },
  args: {
    Kind: "Default",
  },
  parameters: {
    layout: "fullscreen",
    design: { type: "figma", url: figma.screen7 },
  },
} satisfies Meta<typeof Here>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const List: Story = {
  args: { Kind: "List" },
};

export const Ask: Story = {
  args: { Kind: "Ask" },
};

export const Denied: Story = {
  args: { Kind: "Denied" },
};
