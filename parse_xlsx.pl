#!/usr/bin/perl
use strict;
use warnings;
use utf8;
binmode(STDOUT, ":utf8");

my $file = shift @ARGV;
open(my $fh, '<', $file) or die "Cannot open $file: $!";
my $content = do { local $/; <$fh> };
close $fh;

while ($content =~ /<row\s[^>]*r="(\d+)"[^>]*>(.*?)<\/row>/sg) {
    my $row_num = $1;
    my $row_content = $2;
    my @cells;
    while ($row_content =~ /<c\s([^>]*)>(.*?)<\/c>/sg) {
        my ($attrs, $cell_content) = ($1, $2);
        my ($ref) = $attrs =~ /r="([A-Z]+\d+)"/;
        my ($type) = $attrs =~ /t="([^"]+)"/;
        $type //= '';
        $ref //= '?';
        my $value = '';
        if ($type eq 'inlineStr') {
            if ($cell_content =~ /<t[^>]*>(.*?)<\/t>/s) {
                $value = $1;
            }
        } elsif ($cell_content =~ /<v>(.*?)<\/v>/s) {
            $value = $1;
        }
        $value =~ s/&#(\d+);/chr($1)/ge;
        $value =~ s/&amp;/&/g;
        $value =~ s/&lt;/</g;
        $value =~ s/&gt;/>/g;
        $value =~ s/&quot;/"/g;
        $value =~ s/&apos;/'/g;
        $value =~ s/[\r\n\t]+/ /g;
        push @cells, "[$ref] $value";
    }
    if (@cells) {
        print "R$row_num: " . join(" | ", @cells) . "\n";
    }
}
