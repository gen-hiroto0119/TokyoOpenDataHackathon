import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrivalInput } from "./ArrivalInput.js";
import { figma } from "../figma.js";

const meta = {
  title: "Arrival / Input",
  component: ArrivalInput,
  argTypes: {
    State: { control: "select", options: ["Empty", "Read"] },
  },
  args: {
    State: "Read",
    ShowReader: true,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 358 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.arrivalInput },
  },
} satisfies Meta<typeof ArrivalInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Read: Story = {};

export const Empty: Story = {
  args: { State: "Empty" },
};
