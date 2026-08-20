import type { Meta, StoryObj } from "@storybook/react-vite";
import { Participant } from "./Participant.js";
import { figma } from "../figma.js";

const meta = {
  title: "Participant",
  component: Participant,
  argTypes: {
    Name: { control: "text" },
    Detail: { control: "text" },
    Initial: { control: "text" },
    Role: { control: "select", options: ["Host", "Invitee"] },
    Progress: { control: "select", options: ["Joined", "Draft", "Invited", "Opened"] },
  },
  args: {
    Name: "ひろと",
    Detail: "下書き",
    Initial: "ひ",
    Role: "Host",
    Progress: "Draft",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 358 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.participant },
  },
} satisfies Meta<typeof Participant>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Host: Story = {};

export const InviteeDraft: Story = {
  args: { Role: "Invitee", Progress: "Draft" },
};

export const InviteeInvited: Story = {
  args: { Role: "Invitee", Progress: "Invited" },
};

export const InviteeOpened: Story = {
  args: { Role: "Invitee", Progress: "Opened" },
};

export const InviteeJoined: Story = {
  args: { Role: "Invitee", Progress: "Joined" },
};
