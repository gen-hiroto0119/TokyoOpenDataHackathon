import type { Meta, StoryObj } from "@storybook/react-vite";
import { Composer } from "./Composer.js";
import { figma } from "../figma.js";

const meta = {
  title: "Composer / Input",
  component: Composer,
  argTypes: {
    Label: { control: "text" },
    Prompt: { control: "text" },
    Hint: { control: "text" },
    ShowAddAction: { control: "boolean" },
    State: {
      control: "select",
      options: ["Empty", "Editing", "Processing", "Disabled"],
    },
  },
  args: {
    Label: "ルームの予定",
    Prompt: "例：AさんはJR埼京線、Bさんは丸ノ内線。10:30に都庁展望室へ行きたい",
    Hint: "目的地、時刻、参加者を簡単に入力してください",
    ShowAddAction: true,
    State: "Empty",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 358 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.composer },
  },
} satisfies Meta<typeof Composer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Editing: Story = {
  args: { State: "Editing" },
};

export const Processing: Story = {
  args: { State: "Processing" },
};

export const Disabled: Story = {
  args: { State: "Disabled" },
};
