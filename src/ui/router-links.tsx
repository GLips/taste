import { Anchor, type AnchorProps, Button, type ButtonProps } from "@mantine/core";
import { createLink } from "@tanstack/react-router";
import type { AnchorHTMLAttributes, Ref } from "react";

// Mantine's `component={Link}` erases the router's typed `to`/`params`; `createLink` keeps them.
type AnchorElementProps = AnchorProps & AnchorHTMLAttributes<HTMLAnchorElement> & { ref?: Ref<HTMLAnchorElement> };
type ButtonElementProps = ButtonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { ref?: Ref<HTMLAnchorElement> };

export const AnchorLink = createLink((props: AnchorElementProps) => <Anchor component="a" {...props} />);
export const ButtonLink = createLink((props: ButtonElementProps) => <Button component="a" {...props} />);
