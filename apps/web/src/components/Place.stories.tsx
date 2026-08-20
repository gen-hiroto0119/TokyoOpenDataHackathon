import type { Meta, StoryObj } from "@storybook/react-vite";
import { Place } from "./Place.js";
import { figma } from "../figma.js";

const meta = {
  title: "Place",
  component: Place,
  argTypes: {
    Kind: { control: "select", options: ["Destination", "Meeting", "Exit"] },
    Name: { control: "text" },
    Detail: { control: "text" },
    Photo: { control: "select", options: ["Shown", "Hidden"] },
    Credit: { control: "text" },
  },
  args: {
    Kind: "Destination",
    Name: "東京都庁",
    Detail: "新宿区西新宿2-8-1",
    Photo: "Shown",
    Credit: "写真: Google",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 358 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.place },
  },
} satisfies Meta<typeof Place>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Destination: Story = {};

export const Meeting: Story = {
  args: { Kind: "Meeting", Name: "西口交番前", Detail: "1階" },
};

export const Exit: Story = {
  args: { Kind: "Exit" },
};

export const PhotoHidden: Story = {
  args: { Photo: "Hidden" },
};
