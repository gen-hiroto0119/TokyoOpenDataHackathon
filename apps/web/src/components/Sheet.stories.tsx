import type { Meta, StoryObj } from "@storybook/react-vite";
import { Sheet } from "./Sheet.js";
import { figma } from "../figma.js";

const meta = {
  title: "Sheet",
  component: Sheet,
  argTypes: {
    Height: { control: "select", options: ["Peek", "Full"] },
    Title: { control: "text" },
  },
  args: {
    Height: "Peek",
    Title: "いまいる場所を選ぶ",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 390, paddingTop: 40, background: "#eef1f3" }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.sheet },
  },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

function Slot() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 8,
        background: "#eef1f3",
        flexShrink: 0,
      }}
    />
  );
}

export const Peek: Story = {
  args: { Height: "Peek" },
  render: (args) => (
    <Sheet {...args}>
      <Slot />
    </Sheet>
  ),
};

export const Full: Story = {
  args: { Height: "Full" },
  render: (args) => (
    <Sheet {...args}>
      <Slot />
    </Sheet>
  ),
};
