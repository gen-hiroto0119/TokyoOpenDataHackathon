import type { Meta, StoryObj } from "@storybook/react-vite";
import { Consent } from "./Consent.js";
import { figma } from "../figma.js";

const meta = {
  title: "Consent / Data use",
  component: Consent,
  argTypes: {
    Kind: { control: "select", options: ["Route", "Camera", "Expiry"] },
  },
  args: {
    Kind: "Route",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 358 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.consent },
  },
} satisfies Meta<typeof Consent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Route: Story = {};

export const Camera: Story = {
  args: { Kind: "Camera" },
};

export const Expiry: Story = {
  args: { Kind: "Expiry" },
};
