import type { Meta, StoryObj } from "@storybook/react-vite";
import { Path } from "./Path.js";
import { iconNames } from "./Icon.js";
import { figma } from "../figma.js";

const meta = {
  title: "Path / Step",
  component: Path,
  argTypes: {
    State: { control: "select", options: ["Next", "Done", "Later"] },
    Kind: { control: "select", options: ["Landmark", "Move"] },
    Landmark: { control: "text" },
    Detail: { control: "text" },
    Goal: { control: "text" },
    ShowGoal: { control: "boolean" },
    Icon: { control: "select", options: [...iconNames] },
  },
  args: {
    State: "Next",
    Kind: "Landmark",
    Landmark: "西口交番前",
    Detail: "右へ曲がる · 40m",
    Goal: "集合場所",
    ShowGoal: false,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 358 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.path },
  },
} satisfies Meta<typeof Path>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LandmarkNext: Story = {};

export const LandmarkDone: Story = {
  args: { State: "Done" },
};

export const LandmarkLater: Story = {
  args: { State: "Later" },
};

export const LandmarkLaterGoal: Story = {
  args: { State: "Later", ShowGoal: true },
};

export const MoveNext: Story = {
  args: { Kind: "Move", State: "Next" },
};

export const MoveDone: Story = {
  args: { Kind: "Move", State: "Done" },
};

export const MoveLater: Story = {
  args: { Kind: "Move", State: "Later" },
};
