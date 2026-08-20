import type { Meta, StoryObj } from "@storybook/react-vite";
import { CandidateCompare } from "./CandidateCompare.js";
import { figma } from "../figma.js";

const meta = {
  title: "Screens / 5 集合候補",
  component: CandidateCompare,
  argTypes: {
    Action: { control: "select", options: ["Shown", "Hidden"] },
  },
  args: {
    Action: "Shown",
  },
  parameters: {
    layout: "fullscreen",
    design: { type: "figma", url: figma.screen5 },
  },
} satisfies Meta<typeof CandidateCompare>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Host: Story = {};

export const Invitee: Story = {
  args: { Action: "Hidden" },
  parameters: {
    design: { type: "figma", url: figma.screen5invitee },
  },
};
