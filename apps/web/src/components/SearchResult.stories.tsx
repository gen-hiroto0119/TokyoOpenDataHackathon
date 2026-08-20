import type { Meta, StoryObj } from "@storybook/react-vite";
import { SearchResult } from "./SearchResult.js";
import { figma } from "../figma.js";

const meta = {
  title: "Search / Result",
  component: SearchResult,
  argTypes: {
    Name: { control: "text" },
    Detail: { control: "text" },
    Distance: { control: "text" },
    Photo: { control: "select", options: ["Shown", "Hidden"] },
  },
  args: {
    Name: "東京都庁",
    Detail: "新宿区西新宿2-8-1",
    Distance: "徒歩 12分",
    Photo: "Shown",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 390 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.searchResult },
  },
} satisfies Meta<typeof SearchResult>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Shown: Story = {};

export const Hidden: Story = {
  args: { Photo: "Hidden" },
};
