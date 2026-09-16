// Adapted from https://beui.dev/r/tabs (MIT; see LICENSE).
// Radix supplies roving focus, ARIA relationships and keyboard activation.
import {
  createContext,
  forwardRef,
  useContext,
  useState,
  type ComponentPropsWithoutRef,
} from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { clsx } from 'clsx';
import { SelectionIndicator, SelectionScope } from './selection';

const ActiveTab = createContext({ value: '', setValue: (_value: string) => {} });

export const Root = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Tabs.Root>>(
  function Root({ value, defaultValue = '', onValueChange, children, ...props }, ref) {
    const [internal, setInternal] = useState(defaultValue);
    const current = value ?? internal;
    const setValue = (next: string) => {
      if (value === undefined) setInternal(next);
      onValueChange?.(next);
    };
    return (
      <ActiveTab.Provider value={{ value: current, setValue }}>
        <SelectionScope>
          <Tabs.Root {...props} ref={ref} value={current} onValueChange={setValue}>
            {children}
          </Tabs.Root>
        </SelectionScope>
      </ActiveTab.Provider>
    );
  },
);

export const List = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Tabs.List>>(
  function List(props, ref) {
    return <Tabs.List {...props} ref={ref} />;
  },
);

export const Trigger = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof Tabs.Trigger>>(
  function Trigger({ value, className, children, onClick, ...props }, ref) {
    const context = useContext(ActiveTab);
    const active = context.value === value;
    return (
      <Tabs.Trigger
        {...props}
        ref={ref}
        value={value}
        data-active={active}
        onClick={(event) => {
          onClick?.(event);
          // Also support activation dispatched as click by assistive technology.
          if (!event.defaultPrevented && !props.disabled && !active) context.setValue(value);
        }}
        className={clsx('beui-selection', className)}
      >
        <SelectionIndicator active={active} />
        {children}
      </Tabs.Trigger>
    );
  },
);

export const Content = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Tabs.Content>>(
  function Content({ value, className, ...props }, ref) {
    const active = useContext(ActiveTab).value === value;
    // Keep the same element type when hidden: tracker rows retain image refs,
    // scroll position and local state. forceMount remains opt-in for other pages.
    return (
      <Tabs.Content
        {...props}
        ref={ref}
        value={value}
        hidden={!active}
        aria-hidden={!active}
        className={clsx('beui-tab-content', className)}
      />
    );
  },
);
