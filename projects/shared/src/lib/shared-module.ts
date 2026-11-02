import { NgModule } from '@angular/core';
import { Badge } from './components/badge/badge';
import { Button } from './components/button/button';
import { Card } from './components/card/card';
import { Input } from './components/input/input';
import { Select } from './components/select/select';
import { Spinner } from './components/spinner/spinner';
import { Table } from './components/table/table';

/** All shared UI components, for use in a standalone component's `imports` array. */
export const SHARED_UI = [Badge, Button, Card, Input, Select, Spinner, Table] as const;

/** NgModule wrapper for consumers that prefer importing a single module. */
@NgModule({
  imports: [...SHARED_UI],
  exports: [...SHARED_UI],
})
export class SharedModule {}
