import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button.js";
import { figma } from "../figma.js";

const meta = {
  title: "Button",
  component: Button,
  argTypes: {
    Label: { control: "text" },
    Size: { control: "select", options: ["Medium", "Large"] },
    Style: { control: "select", options: ["Primary", "Secondary"] },
    State: {
      control: "select",
      options: ["Default", "Hover", "Focus", "Pressed", "Disabled"],
    },
  },
  args: {
    Label: "集合地点に決める",
    Size: "Medium",
    Style: "Primary",
    State: "Default",
  },
  parameters: {
    design: { type: "figma", url: figma.button },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: { Style: "Secondary" },
};

export const Large: Story = {
  args: { Size: "Large" },
};

export const Disabled: Story = {
  args: { State: "Disabled" },
};
