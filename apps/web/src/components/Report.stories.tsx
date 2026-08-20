import type { Meta, StoryObj } from "@storybook/react-vite";
import { Report } from "./Report.js";
import { figma } from "../figma.js";

const meta = {
  title: "Report",
  component: Report,
  argTypes: {
    Selected: { control: "select", options: ["None", "Early", "OnTime", "Late"] },
  },
  args: {
    Selected: "None",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 358 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.report },
  },
} satisfies Meta<typeof Report>;

export default meta;
type Story = StoryObj<typeof meta>;

export const None: Story = {};

export const Early: Story = {
  args: { Selected: "Early" },
};

export const OnTime: Story = {
  args: { Selected: "OnTime" },
};

export const Late: Story = {
  args: { Selected: "Late" },
};
