using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AbOvo.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddContentBundle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ContentBundles",
                columns: table => new
                {
                    Track = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Tag = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    BundleJson = table.Column<string>(type: "jsonb", nullable: false),
                    IngestedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContentBundles", x => new { x.Track, x.Tag });
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ContentBundles");
        }
    }
}
