import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppBar } from "./AppBar.js";
import { figma } from "../figma.js";

const meta = {
  title: "App bar",
  component: AppBar,
  argTypes: {
    Title: { control: "text" },
    Back: { control: "select", options: ["Shown", "Hidden"] },
  },
  args: {
    Title: "集合場所の候補",
    Back: "Shown",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 390 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.appBar },
  },
} satisfies Meta<typeof AppBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Shown: Story = {};

export const Hidden: Story = {
  args: { Back: "Hidden" },
};
