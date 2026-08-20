import type { Meta, StoryObj } from "@storybook/react-vite";
import { MapMarker } from "./Map.js";
import { figma } from "../figma.js";

const meta = {
  title: "Map / Marker",
  component: MapMarker,
  argTypes: {
    Kind: { control: "select", options: ["Gate", "Meeting", "Onward", "Here", "Member"] },
    Initial: { control: "text" },
  },
  args: {
    Kind: "Gate",
    Initial: "さ",
  },
  decorators: [
    (Story) => (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 64,
          height: 64,
          background: "#f8fafb",
        }}
      >
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.mapMarker },
  },
} satisfies Meta<typeof MapMarker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gate: Story = {};

export const Meeting: Story = {
  args: { Kind: "Meeting" },
};

export const Onward: Story = {
  args: { Kind: "Onward" },
};

export const Here: Story = {
  args: { Kind: "Here" },
};

export const Member: Story = {
  args: { Kind: "Member" },
};
