import type { Meta, StoryObj } from "@storybook/react-vite";
import { Status } from "./Status.js";
import { figma } from "../figma.js";

const meta = {
  title: "Status / Progress",
  component: Status,
  argTypes: {
    State: { control: "select", options: ["Progress", "Failed"] },
  },
  args: {
    State: "Progress",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 358 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.status },
  },
} satisfies Meta<typeof Status>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Progress: Story = {};

export const Failed: Story = {
  args: { State: "Failed" },
};
