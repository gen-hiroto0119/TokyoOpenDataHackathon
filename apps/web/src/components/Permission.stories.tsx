import type { Meta, StoryObj } from "@storybook/react-vite";
import { Permission } from "./Permission.js";
import { figma } from "../figma.js";

const meta = {
  title: "Permission / Camera",
  component: Permission,
  argTypes: {
    State: { control: "select", options: ["Ask", "Denied"] },
  },
  args: {
    State: "Ask",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 358 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.permission },
  },
} satisfies Meta<typeof Permission>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ask: Story = {};

export const Denied: Story = {
  args: { State: "Denied" },
};
