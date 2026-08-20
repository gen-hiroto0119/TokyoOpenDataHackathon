import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon, iconNames } from "./Icon.js";
import { figma } from "../figma.js";

const meta = {
  title: "Icon",
  component: Icon,
  argTypes: {
    Name: { control: "select", options: [...iconNames] },
  },
  args: { Name: "Search" },
  parameters: {
    design: { type: "figma", url: figma.icon },
  },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Name: Story = {};

export const All: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, width: 280 }}>
      {iconNames.map((name) => (
        <Icon key={name} Name={name} />
      ))}
    </div>
  ),
};
