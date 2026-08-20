import type { Meta, StoryObj } from "@storybook/react-vite";
import { Handoff } from "./Handoff.js";
import { figma } from "../figma.js";

const meta = {
  title: "Handoff",
  component: Handoff,
  argTypes: {
    State: { control: "select", options: ["Ready", "Waiting"] },
    From: { control: "text" },
    To: { control: "text" },
  },
  args: {
    State: "Ready",
    From: "出口 8 を出たところから",
    To: "東京都庁",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 358 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.handoff },
  },
} satisfies Meta<typeof Handoff>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Waiting: Story = {
  args: { State: "Waiting" },
};
