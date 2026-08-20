import type { Meta, StoryObj } from "@storybook/react-vite";
import { TabBar } from "./TabBar.js";
import { figma } from "../figma.js";

const meta = {
  title: "Tab bar",
  component: TabBar,
  argTypes: {
    Selected: { control: "select", options: ["Route", "Room"] },
  },
  args: {
    Selected: "Route",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 390 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.tabBar },
  },
} satisfies Meta<typeof TabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Route: Story = {};

export const Room: Story = {
  args: { Selected: "Room" },
};
