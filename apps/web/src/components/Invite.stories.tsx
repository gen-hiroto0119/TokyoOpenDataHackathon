import type { Meta, StoryObj } from "@storybook/react-vite";
import { Invite } from "./Invite.js";
import { figma } from "../figma.js";

const meta = {
  title: "Invite / Link",
  component: Invite,
  argTypes: {
    Link: { control: "text" },
    State: { control: "select", options: ["Default", "Copied", "Disabled"] },
  },
  args: {
    Link: "あつまっぷ.example/join/nishi-1",
    State: "Default",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 358 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.invite },
  },
} satisfies Meta<typeof Invite>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Copied: Story = {
  args: { State: "Copied" },
};

export const Disabled: Story = {
  args: { State: "Disabled" },
};
